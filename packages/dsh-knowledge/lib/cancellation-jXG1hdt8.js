//#region src/core/cancellation.ts
/** Abort reasons are never reflected: they may contain upstream response data. */
function assertActive(signal) {
	if (signal?.aborted) throw new Error("knowledge-cancelled");
}
async function withDeadline(signal, timeoutMs, run, timeoutCode = "knowledge-model-timeout") {
	assertActive(signal);
	const controller = new AbortController();
	let rejectAbort;
	const interrupted = new Promise((_resolve, reject) => {
		rejectAbort = reject;
	});
	const cancel = () => {
		controller.abort();
		rejectAbort(/* @__PURE__ */ new Error("knowledge-cancelled"));
	};
	signal.addEventListener("abort", cancel, { once: true });
	const timer = setTimeout(() => {
		controller.abort();
		rejectAbort(new Error(timeoutCode));
	}, timeoutMs);
	try {
		return await Promise.race([run(controller.signal), interrupted]);
	} finally {
		clearTimeout(timer);
		signal.removeEventListener("abort", cancel);
		controller.abort();
	}
}
//#endregion
export { withDeadline as n, assertActive as t };
