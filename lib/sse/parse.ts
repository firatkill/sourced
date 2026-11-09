export type RawSse = { event: string; data: string };

export function createSseParser(onEvent: (e: RawSse) => void) {
  let buffer = '';
  let event = 'message';
  let data: string[] = [];

  function dispatchLine(line: string) {
    if (line === '') {
      if (data.length > 0) onEvent({ event, data: data.join('\n') });
      event = 'message';
      data = [];
      return;
    }
    if (line.startsWith(':')) return; // comment / heartbeat
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? '' : line.slice(idx + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
    // 'id' and 'retry' are ignored
  }

  return {
    push(chunk: string) {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.search(/\r\n|\r|\n/)) !== -1) {
        // A lone '\r' at the very end may be the first half of '\r\n': wait for more data.
        if (buffer[nl] === '\r' && nl === buffer.length - 1) break;
        const line = buffer.slice(0, nl);
        const sepLen = buffer.startsWith('\r\n', nl) ? 2 : 1;
        buffer = buffer.slice(nl + sepLen);
        dispatchLine(line);
      }
    },
    end() {
      if (buffer.length > 0) dispatchLine(buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer);
      dispatchLine('');
      buffer = '';
    },
  };
}
