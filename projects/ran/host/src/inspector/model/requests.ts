// The request log: every call the frame's queries make to the host's backend, recorded host-side
// with what the snapshots leave out, how long it took and a few of its rows. See SPEC.md §5.3.
import type {
  Backend,
  BackendQueryRequest,
  ExportFormatOptions,
  InspectedApp,
  QueryInput,
} from '@holistics/anfra-sdk/common';

export interface RequestEntry {
  id: number;
  method: 'submitQuery' | 'fieldSuggestions' | 'exportQuery';
  /** When it was sent, as an ISO time. */
  at: string;
  /** Absent while pending. */
  durationMs?: number;
  status: 'pending' | 'ok' | 'error' | 'aborted';
  dataset: string;
  /** The query's declared AQL; filters, sorts and drills are in `input`. */
  aql?: string;
  input?: QueryInput;
  page?: number;
  pageSize?: number;
  bustCache?: boolean;
  /** The timezone it ran in; absent when the app declares none, leaving the backend's default. */
  timezone?: string;
  /** For an export: the file format asked for, its options and the file's name. */
  format?: string;
  formatOptions?: ExportFormatOptions;
  filename?: string;
  /** For a field suggestion: `model.field` and what was typed. */
  field?: string;
  q?: string;
  fromCache?: boolean;
  numRows?: number;
  columns?: string[];
  /** The first rows, as the backend returned them, positional by `columns`. */
  preview?: unknown[][];
  error?: string;
}

export interface RequestLog {
  /** Oldest first. The same array until the log changes. */
  entries(): readonly RequestEntry[];
  subscribe(listener: () => void): () => void;
}

export interface RecordOptions {
  /** How many requests to keep; the oldest go first. */
  limit?: number;
  /** How many rows of each result to keep. */
  previewRows?: number;
}

/** A log, and what fills it. */
export interface RequestRecorder {
  log: RequestLog;
  /**
   * `backend`, recording every call it answers. Pass the result to the frame in place of the one
   * wrapped; the log fills whether or not anyone is inspecting.
   */
  record(backend: Backend): Backend;
}

/** A log for one mounted frame. Make it before the frame, so its first requests are in it. */
export function createRequestLog({ limit = 200, previewRows = 20 }: RecordOptions = {}): RequestRecorder {
  let entries: readonly RequestEntry[] = [];
  let nextId = 1;
  const listeners = new Set<() => void>();
  // A listener that throws mustn't reach the frame's request.
  const changed = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch (err) {
        console.error(err);
      }
    }
  };
  const add = (entry: RequestEntry) => {
    entries = [...entries.slice(Math.max(0, entries.length - limit + 1)), entry];
    changed();
  };
  const settle = (id: number, patch: Partial<RequestEntry>) => {
    entries = entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));
    changed();
  };

  async function track<T>(
    entry: Omit<RequestEntry, 'id' | 'at' | 'status'>,
    signal: AbortSignal,
    call: () => Promise<T>,
    summary: (result: T) => Partial<RequestEntry>,
  ): Promise<T> {
    const id = nextId++;
    const started = performance.now();
    add({ ...entry, id, at: new Date().toISOString(), status: 'pending' });
    const durationMs = () => Math.round(performance.now() - started);
    let result: T;
    try {
      result = await call();
    } catch (err) {
      settle(id, {
        status: signal.aborted ? 'aborted' : 'error',
        durationMs: durationMs(),
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
      throw err;
    }
    // The result is the frame's whatever the log makes of it: one it can't summarize is still ok.
    let details: Partial<RequestEntry> = {};
    try {
      details = summary(result);
    } catch (err) {
      console.error(err);
    }
    settle(id, { status: 'ok', durationMs: durationMs(), ...details });
    return result;
  }

  return {
    record: (backend) => ({
      // Only when the wrapped backend can export: without it, the SDK tells the app it can't.
      ...(backend.exportQuery && {
        exportQuery: (request, signal) =>
          track(
            {
              method: 'exportQuery',
              dataset: request.dataset,
              aql: request.aql,
              input: request.input,
              timezone: request.timezone,
              format: request.format,
              formatOptions: request.formatOptions,
              filename: request.filename,
            },
            signal,
            // biome-ignore lint/style/noNonNullAssertion: checked above
            () => backend.exportQuery!(request, signal),
            (result) => ({ numRows: result.rowCount }),
          ),
      }),
      submitQuery: (request, signal) =>
        track(
          {
            method: 'submitQuery',
            dataset: request.dataset,
            aql: request.aql,
            input: request.input,
            page: request.page,
            pageSize: request.pageSize,
            timezone: request.timezone,
            bustCache: request.bustCache,
          },
          signal,
          () => backend.submitQuery(request, signal),
          (result) => ({
            fromCache: result.debug?.fromCache,
            numRows: result.meta?.numRows ?? result.values.length,
            columns: result.columns.map((column) => column.name),
            preview: result.values.slice(0, previewRows),
          }),
        ),
      fieldSuggestions: (request, signal) =>
        track(
          {
            method: 'fieldSuggestions',
            dataset: request.dataset,
            field: `${request.model}.${request.field}`,
            q: request.q,
          },
          signal,
          () => backend.fieldSuggestions(request, signal),
          (values) => ({ numRows: values.length }),
        ),
    }),
    log: {
      entries: () => entries,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
}

/** A query a request is attributed to. */
export interface QueryRef {
  app: number;
  name: string;
}

/**
 * The queries a request may belong to: those that declare its dataset and AQL. A request carries
 * the declared AQL, not the executed one, so this is exact unless two queries declare the same.
 */
export function queriesOf(
  entry: Pick<BackendQueryRequest, 'dataset' | 'aql'> & { method: RequestEntry['method'] },
  apps: InspectedApp[],
): QueryRef[] {
  if (entry.method === 'fieldSuggestions') return [];
  return apps.flatMap((app, index) =>
    Object.entries(app.declaration.queries)
      .filter(([, q]) => q.dataset === entry.dataset && q.aql === entry.aql)
      .map(([name]) => ({ app: index, name })),
  );
}

/** Each query's requests, newest first, keyed `<app>/<name>`; and the requests no query claims. */
export function attributeRequests(entries: readonly RequestEntry[], apps: InspectedApp[]) {
  const byQuery = new Map<string, { entry: RequestEntry; shared: boolean }[]>();
  const other: RequestEntry[] = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i] as RequestEntry;
    const refs = entry.aql ? queriesOf({ ...entry, aql: entry.aql }, apps) : [];
    if (refs.length === 0) other.push(entry);
    for (const ref of refs) {
      const key = `${ref.app}/${ref.name}`;
      const item = { entry, shared: refs.length > 1 };
      const list = byQuery.get(key);
      if (list) list.push(item);
      else byQuery.set(key, [item]);
    }
  }
  return { byQuery, other };
}
