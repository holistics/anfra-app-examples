// Gateway for the deployed Churn Radar: the only process that listens publicly.
//
// It starts `anfra serve` on loopback (without the OpenAI key in its environment), forwards only
// what the Data App needs, and serves the copilot's OpenAI calls at /ai. `anfra serve` has no
// authentication and its API can run raw SQL, which in DuckDB can read files in the container, so:
//
//   - only the shell's routes and five read-only commands are forwarded; MCP and the rest are 404;
//   - core.query must be AQL whose text appears in the app's HTML (the app's own queries), and its
//     input may not call AQL's SQL passthrough functions.
//
// The site itself sits behind the platform's password (proto auth). Its session cookie is SameSite=Lax,
// and the app runs in a sandboxed frame (opaque origin), so the app's own fetches to /ai arrive without
// the cookie and the password gate turns them away. The gateway therefore adds a small relay to the shell
// page (same origin, cookie included): the app posts its copilot calls to the shell, which makes them.
package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	anfraAddr = "127.0.0.1:7878"
	appPath   = "/apps/churn-radar"
	repoDir   = "/churn-radar"
	appFile   = repoDir + "/apps/churn-radar.html"
	maxBody   = 4 << 20
)

var (
	passthrough = regexp.MustCompile(`(?i)\b(sql|agg)_(text|number|date|datetime|truefalse)\b|\bai_(complete|query|similarity|classify|summarize)\b`)
	space       = regexp.MustCompile(`\s+`)
	allowedCmds = map[string]bool{"core.query": true, "core.show": true, "core.status": true, "core.version": true, "core.validate": true}
)

func norm(s string) string { return strings.TrimSpace(space.ReplaceAllString(s, " ")) }

func main() {
	key := os.Getenv("OPENAI_API_KEY")
	model := envOr("OPENAI_MODEL", "gpt-5-mini")
	effort := envOr("OPENAI_REASONING_EFFORT", "low")
	listen := ":" + envOr("PORT", "8080")

	html, err := os.ReadFile(appFile)
	if err != nil {
		log.Fatalf("read app: %v", err)
	}
	appText := norm(string(html))

	// anfra serve, on loopback, with every OPENAI_* variable removed from its environment.
	cmd := exec.Command("anfra", "serve", "--addr", anfraAddr, "--no-mcp", "--no-watch")
	cmd.Dir = repoDir
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	for _, kv := range os.Environ() {
		if !strings.HasPrefix(kv, "OPENAI_") {
			cmd.Env = append(cmd.Env, kv)
		}
	}
	if err := cmd.Start(); err != nil {
		log.Fatalf("start anfra: %v", err)
	}
	go func() { err := cmd.Wait(); log.Fatalf("anfra serve exited: %v", err) }()
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGTERM, syscall.SIGINT)
	go func() { s := <-sig; _ = cmd.Process.Signal(s); time.Sleep(2 * time.Second); os.Exit(0) }()

	target, _ := url.Parse("http://" + anfraAddr)
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.FlushInterval = -1 // /appserve/events is a stream
	// anfra serve only answers loopback hosts (a DNS-rebinding guard), so present every request as
	// a local one: Host, and the Origin/Referer a browser sends with API calls.
	direct := proxy.Director
	proxy.Director = func(r *http.Request) {
		direct(r)
		r.Host = anfraAddr
		if r.Header.Get("Origin") != "" {
			r.Header.Set("Origin", "http://"+anfraAddr)
		}
		if ref, err := url.Parse(r.Header.Get("Referer")); err == nil && ref.Host != "" {
			ref.Scheme, ref.Host = "http", anfraAddr
			r.Header.Set("Referer", ref.String())
		}
		r.Header.Del("X-Forwarded-Host")
		if r.URL.Path == appPath {
			r.Header.Del("Accept-Encoding") // the shell page gets the relay added below
		}
	}
	proxy.ModifyResponse = func(res *http.Response) error {
		if res.Request.URL.Path != appPath || !strings.HasPrefix(res.Header.Get("Content-Type"), "text/html") || res.Header.Get("Content-Encoding") != "" {
			return nil
		}
		body, err := io.ReadAll(res.Body)
		res.Body.Close()
		if err != nil {
			return err
		}
		if i := bytes.LastIndex(body, []byte("</body>")); i >= 0 {
			body = append(body[:i:i], append([]byte(relayScript), body[i:]...)...)
		}
		res.Body = io.NopCloser(bytes.NewReader(body))
		res.ContentLength = int64(len(body))
		res.Header.Set("Content-Length", strconv.Itoa(len(body)))
		return nil
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		// Kubernetes probes hit "/" and follow redirects: answer them here instead of redirecting.
		if p == "/healthz" || (p == "/" && strings.HasPrefix(r.UserAgent(), "kube-probe/")) {
			w.Write([]byte("ok"))
			return
		}
		switch {
		case p == "/" || p == "/apps" || p == "/apps/":
			http.Redirect(w, r, appPath, http.StatusFound)
		case p == appPath || strings.HasPrefix(p, "/appserve/"):
			proxy.ServeHTTP(w, r)
		case strings.HasPrefix(p, "/api/"):
			cmdName := strings.TrimPrefix(p, "/api/")
			if r.Method != http.MethodPost || !allowedCmds[cmdName] {
				http.NotFound(w, r)
				return
			}
			if cmdName == "core.query" && !queryAllowed(w, r, appText) {
				return
			}
			proxy.ServeHTTP(w, r)
		default:
			http.NotFound(w, r)
		}
	})
	ai := &aiProxy{key: key, model: model, effort: effort, limiter: newLimiter(40, time.Minute)}
	mux.HandleFunc("/ai/health", ai.health)
	mux.HandleFunc("/ai/chat", ai.chat)

	log.Printf("gateway on %s → anfra %s (copilot model %s, key set: %v)", listen, anfraAddr, model, key != "")
	log.Fatal(http.ListenAndServe(listen, mux))
}

// relayScript runs in the shell page. It answers only the app's frame, and only for /ai/health and /ai/chat.
const relayScript = `<script>
addEventListener('message', async (e) => {
  const m = e.data;
  if (!m || typeof m.aiRelay !== 'string' || !['/health', '/chat'].includes(m.path)) return;
  if (![...document.querySelectorAll('iframe')].some((f) => f.contentWindow === e.source)) return;
  let status = 502, text = '{"error":"could not reach the copilot"}';
  try {
    const r = await fetch('/ai' + m.path, m.path === '/chat' ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: String(m.body) } : {});
    status = r.status; text = await r.text();
  } catch {}
  e.source.postMessage({ aiRelay: m.aiRelay, status, text }, '*');
});
</script>`

// queryAllowed admits only the app's own AQL, with no SQL passthrough in its input.
func queryAllowed(w http.ResponseWriter, r *http.Request, appText string) bool {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	if err != nil {
		http.Error(w, "request too large", http.StatusRequestEntityTooLarge)
		return false
	}
	var q struct {
		Lang  string          `json:"lang"`
		Query string          `json:"query"`
		Input json.RawMessage `json:"input"`
	}
	if err := json.Unmarshal(body, &q); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return false
	}
	deny := func(code int, msg string) bool {
		log.Printf("denied core.query (%s): lang=%q query=%.80q", msg, q.Lang, norm(q.Query))
		http.Error(w, msg, code)
		return false
	}
	switch {
	case q.Lang != "" && q.Lang != "aql":
		return deny(http.StatusForbidden, "only the app's AQL queries are allowed here")
	case !strings.Contains(appText, norm(q.Query)) || len(norm(q.Query)) < 20:
		return deny(http.StatusForbidden, "only the app's AQL queries are allowed here")
	case passthrough.Match(q.Input):
		return deny(http.StatusForbidden, "SQL passthrough is not allowed here")
	}
	r.Body = io.NopCloser(bytes.NewReader(body))
	r.ContentLength = int64(len(body))
	return true
}

// ---------------------------------------------------------------- copilot

type aiProxy struct {
	key, model, effort string
	limiter            *limiter
}

func cors(w http.ResponseWriter) {
	// The Data App frame is sandboxed (opaque origin "null").
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "content-type, x-ai-token")
}

func (a *aiProxy) health(w http.ResponseWriter, r *http.Request) {
	cors(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"ok": a.key != "", "model": a.model})
}

func (a *aiProxy) chat(w http.ResponseWriter, r *http.Request) {
	cors(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		http.NotFound(w, r)
		return
	}
	if a.key == "" {
		jsonError(w, http.StatusServiceUnavailable, "the copilot has no OpenAI key configured")
		return
	}
	if !a.limiter.allow() {
		jsonError(w, http.StatusTooManyRequests, "the copilot is busy, try again in a minute")
		return
	}
	var in struct {
		Messages []json.RawMessage `json:"messages"`
		Tools    []json.RawMessage `json:"tools"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody)).Decode(&in); err != nil || len(in.Messages) == 0 || len(in.Messages) > 120 {
		jsonError(w, http.StatusBadRequest, "messages must be a non-empty array")
		return
	}
	// Only messages and tools come from the page; the model and settings are the gateway's.
	payload := map[string]any{"model": a.model, "messages": in.Messages}
	if len(in.Tools) > 0 {
		payload["tools"], payload["tool_choice"] = in.Tools, "auto"
	}
	if strings.HasPrefix(a.model, "gpt-5") || regexp.MustCompile(`^o\d`).MatchString(a.model) {
		payload["reasoning_effort"] = a.effort
	}
	buf, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(r.Context(), http.MethodPost, "https://api.openai.com/v1/chat/completions", bytes.NewReader(buf))
	req.Header.Set("Authorization", "Bearer "+a.key)
	req.Header.Set("Content-Type", "application/json")
	start := time.Now()
	res, err := (&http.Client{Timeout: 3 * time.Minute}).Do(req)
	if err != nil {
		jsonError(w, http.StatusBadGateway, "could not reach OpenAI")
		return
	}
	defer res.Body.Close()
	log.Printf("copilot %d in %s", res.StatusCode, time.Since(start).Round(time.Millisecond))
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(res.StatusCode)
	io.Copy(w, res.Body)
}

func jsonError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// limiter: at most n copilot calls per window, across all visitors (protects the key's budget).
type limiter struct {
	mu     sync.Mutex
	n      int
	window time.Duration
	times  []time.Time
}

func newLimiter(n int, window time.Duration) *limiter { return &limiter{n: n, window: window} }

func (l *limiter) allow() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	kept := l.times[:0]
	for _, t := range l.times {
		if now.Sub(t) < l.window {
			kept = append(kept, t)
		}
	}
	l.times = kept
	if len(l.times) >= l.n {
		return false
	}
	l.times = append(l.times, now)
	return true
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
