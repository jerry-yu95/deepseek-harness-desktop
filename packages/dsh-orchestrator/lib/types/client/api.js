import { HARNESS_RPC_CHANNEL } from "../wire.js";
export class HarnessClientApi {
    connection;
    constructor(connection) {
        this.connection = connection;
    }
    status(sessionId, signal, period = '7d') {
        return this.call('status', { sessionId, period }, signal);
    }
    async mode(sessionId, mode, objective) {
        const value = await this.call('mode', { sessionId, mode, ...(objective === undefined ? {} : { objective }) });
        return value.status;
    }
    async probe(sessionId, bypassCache = false) {
        return this.call('probe', { sessionId, bypassCache });
    }
    async feedback(sessionId, verdict) {
        const value = await this.call('feedback', { sessionId, verdict });
        return value.status;
    }
    async call(endpoint, payload, signal) {
        const result = await this.connection.rpc.call(HARNESS_RPC_CHANNEL, endpoint, payload, signal);
        if (!result.ok)
            throw new Error(result.error.message);
        const value = result.value;
        if (typeof value === 'object' && value !== null && 'error' in value)
            throw new Error(String(value.error));
        return value;
    }
}
