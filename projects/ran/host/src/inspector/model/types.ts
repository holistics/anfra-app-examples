// Types the model and the UI share: where a link in the panel goes, and what the host tells the
// inspector about the frame it mounted.
import type { DatasetDescriptor, User } from '@holistics/anfra-sdk/common';

export type InspectorTab = 'overview' | 'structure' | 'data' | 'wiring';

/** A structure node to select and reveal; a new nonce repeats a request for the same node. */
export interface NodeRequest {
  key: string;
  nonce: number;
  /** Go to the first query or control in the node, in the Data tab, rather than to the node in Structure. */
  inData?: boolean;
}

/** What the Data tab shows: a search over names, datasets and labels, and a filter. */
export interface DataFilter {
  search: string;
  filter: 'all' | 'errors' | 'dirty';
}

/**
 * Which Data rows are open and which sections are closed. The panel keeps it, so it survives
 * switching tabs, which unmounts the Data tab.
 */
export interface DataExpansion {
  open: Set<string>;
  closedSections: Set<string>;
}

/** Where a link in the panel goes. Every link resolves to one of these; see SPEC.md §4.8. */
export type RevealTarget =
  | {
      tab: InspectorTab /** Opens the Data tab with its filter set, and its search cleared. */;
      filter?: DataFilter['filter'];
    }
  | { entity: 'query' | 'control'; app: number; name: string }
  | { check: number; app: number }
  | { node: string };

/** What the host knows about the frame it mounted, beyond what the frame posts. */
export interface InspectorEnv {
  /** Names the host in the report, e.g. "anfra demo". */
  hostName: string;
  /** The Data App's path, as the host addresses it. */
  path?: string;
  /** The SDK version the host mounts frames with. */
  sdkVersion?: string;
  /** Who reads the app; the frame is provisioned with it. */
  reader: User;
  /** The datasets the frame is provisioned with. */
  datasets: Record<string, DatasetDescriptor>;
}
