import { useCallback, useEffect, useRef, useState } from 'react';
export function useHarnessStatus(api, sessionId) {
    const [status, setStatus] = useState();
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState();
    const request = useRef(0);
    const refresh = useCallback(async () => {
        const seq = ++request.current;
        const controller = new AbortController();
        try {
            const value = await api.status(sessionId, controller.signal);
            if (request.current === seq) {
                setStatus(value);
                setError(undefined);
            }
        }
        catch (cause) {
            if (request.current === seq)
                setError(messageOf(cause));
        }
        finally {
            if (request.current === seq)
                setLoading(false);
        }
    }, [api, sessionId]);
    useEffect(() => {
        setLoading(true);
        setStatus(undefined);
        void refresh();
        const timer = window.setInterval(() => { void refresh(); }, 30_000);
        const onFocus = () => { void refresh(); };
        window.addEventListener('focus', onFocus);
        return () => { request.current += 1; window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
    }, [refresh]);
    const action = useCallback(async (operation) => {
        setBusy(true);
        try {
            setStatus(await operation());
            setError(undefined);
        }
        catch (cause) {
            setError(messageOf(cause));
        }
        finally {
            setBusy(false);
        }
    }, []);
    return {
        status, loading, busy, ...(error === undefined ? {} : { error }), refresh,
        setMode: (mode, objective) => action(() => api.mode(sessionId, mode, objective)),
        probe: bypassCache => action(async () => { await api.probe(sessionId, bypassCache); return api.status(sessionId); }),
        feedback: verdict => action(() => api.feedback(sessionId, verdict)),
    };
}
function messageOf(value) { return value instanceof Error ? value.message : String(value); }
