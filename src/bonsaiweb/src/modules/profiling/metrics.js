const HISTORY = 90;

export function formatFps( value ) {

	return Number.isFinite( value ) && value > 0 ? `${ value.toFixed( 0 ) } fps` : '— fps';

}

export function formatMs( value ) {

	return Number.isFinite( value ) && value > 0 ? `${ value.toFixed( 1 ) } ms` : '—';

}

export function formatCount( value ) {

	return Number.isFinite( value ) && value > 0 ? value.toLocaleString() : '—';

}

export function formatObjects( visible, total ) {

	if ( ! Number.isFinite( total ) || total <= 0 ) return '—';
	return `${ formatCount( visible ) }/${ formatCount( total ) }`;

}

export function formatBytes( bytes ) {

	if ( ! Number.isFinite( bytes ) || bytes <= 0 ) return '—';
	const units = [ 'B', 'KB', 'MB', 'GB' ];
	let size = bytes;
	let unit = 0;
	while ( size >= 1024 && unit < units.length - 1 ) {

		size /= 1024;
		unit += 1;

	}

	const digits = size >= 10 || unit === 0 ? 0 : 1;
	return `${ size.toFixed( digits ) } ${ units[ unit ] }`;

}

function emptyStats() {

	return {
		clientFps: 0,
		wasmFps: 0,
		frameMs: 0,
		objectsVisible: 0,
		objectsTotal: 0,
		trianglesVisible: 0,
		trianglesTotal: 0,
		drawCalls: 0,
		vramUsed: 0,
		vramCapacity: 0,
		workingSetMissing: 0,
	};

}

/** Client rAF FPS plus the latest `viewer.stats()` sample. */
export class ViewerMetrics {

	constructor() {

		this.clientFps = 0;
		this.samples = [];
		this.history = [];
		this.stats = null;
		this.rafId = 0;

	}

	start() {

		if ( this.rafId ) return this;
		let last = performance.now();
		const tick = ( now ) => {

			const dt = now - last;
			last = now;
			if ( dt > 0 ) {

				this.samples.push( 1000 / dt );
				if ( this.samples.length > HISTORY ) this.samples.shift();
				let sum = 0;
				for ( const sample of this.samples ) sum += sample;
				this.clientFps = sum / this.samples.length;

			}

			this.rafId = requestAnimationFrame( tick );

		};

		this.rafId = requestAnimationFrame( tick );

		return this;

	}

	stop() {

		if ( ! this.rafId ) return this;
		cancelAnimationFrame( this.rafId );
		this.rafId = 0;
		return this;

	}

	readViewer( viewer ) {

		try {

			this.stats = viewer?.stats?.() ?? null;

		} catch {

			this.stats = null;

		}

		const fps = this.stats?.fps > 0 ? this.stats.fps : this.clientFps;
		if ( fps > 0 ) {

			this.history.push( fps );
			if ( this.history.length > HISTORY ) this.history.shift();

		}

		return this.getSnapshot();

	}

	getSnapshot() {

		const stats = this.stats;
		return {
			...emptyStats(),
			clientFps: this.clientFps,
			wasmFps: stats?.fps ?? 0,
			frameMs: stats?.frameTimeMs ?? 0,
			objectsVisible: stats?.objects?.visible ?? 0,
			objectsTotal: stats?.objects?.total ?? 0,
			trianglesVisible: stats?.triangles?.visible ?? 0,
			trianglesTotal: stats?.triangles?.total ?? 0,
			drawCalls: stats?.drawCalls ?? 0,
			vramUsed: stats?.vram?.usedBytes ?? 0,
			vramCapacity: stats?.vram?.capacityBytes ?? 0,
			workingSetMissing: stats?.workingSet?.chunksMissing ?? 0,
		};

	}

	getFpsHistory() {

		return this.history;

	}

}
