export class SidecarStringTable {

	chunks = [];
	length = 0;
	add( value ) {

		if ( ! value ) {

			return { offset: 0, length: 0 };

		}

		const existing = this.chunks.join( '' ).indexOf( value );
		if ( existing >= 0 ) {

			return { offset: existing, length: value.length };

		}

		const offset = this.length;
		this.chunks.push( value );
		this.length += value.length;
		return { offset, length: value.length };

	}
	toString() {

		return this.chunks.join( '' );

	}

}
