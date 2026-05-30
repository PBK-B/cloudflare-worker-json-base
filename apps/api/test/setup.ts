import { TextDecoder, TextEncoder } from 'util';

if (typeof global.TextEncoder === 'undefined') {
	(global as typeof globalThis & { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;
}

if (typeof global.TextDecoder === 'undefined') {
	(global as typeof globalThis & { TextDecoder: typeof TextDecoder }).TextDecoder = TextDecoder;
}
