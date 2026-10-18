import { act } from "@testing-library/react";

// A stand-in for the socket.io client: records what is emitted and lets a test fire events the server would send.
export class FakeSocket {
  constructor() {
    this.handlers = {};
    this.emitted = [];
    this.connected = true;
    this.joinAck = { ok: true, participants: [] };
  }

  on(event, handler) {
    (this.handlers[event] ??= []).push(handler);
  }

  off(event, handler) {
    this.handlers[event] = (this.handlers[event] ?? []).filter((existing) => existing !== handler);
  }

  emit(event, payload, ack) {
    this.emitted.push([event, payload]);
    if (typeof ack === "function") ack(event === "join_ticket" ? this.joinAck : { ok: true });
  }

  trigger(event, payload) {
    act(() => {
      (this.handlers[event] ?? []).forEach((handler) => handler(payload));
    });
  }

  listenerCount(event) {
    return (this.handlers[event] ?? []).length;
  }
}
