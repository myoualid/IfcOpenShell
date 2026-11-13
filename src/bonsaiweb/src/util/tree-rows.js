// This file was generated with the assistance of an AI coding tool.
//
// Flat tree rows, as the schedule panels keep them: depth-first order, each
// row with an `id` and the `parentId` of its parent row (0 for a root).

// Ids of the rows above `id`, nearest first.
export function ancestorIds( byId, id ) {

	const result = [];
	let row = byId.get( id );
	while ( row && row.parentId && byId.has( row.parentId ) ) {

		result.push( row.parentId );
		row = byId.get( row.parentId );

	}

	return result;

}

// The rows to draw. Without `match`, a row is hidden when an ancestor is in
// `collapsed`. With `match`, the matching rows and their ancestors are drawn
// whatever is collapsed, so a filter never hides its own results.
export function visibleRows( rows, { collapsed = new Set(), match = null } = {} ) {

	const byId = new Map( rows.map( ( row ) => [ row.id, row ] ) );

	if ( match ) {

		const keep = new Set();
		for ( const row of rows ) {

			if ( ! match( row ) ) continue;
			keep.add( row.id );
			for ( const id of ancestorIds( byId, row.id ) ) keep.add( id );

		}

		return rows.filter( ( row ) => keep.has( row.id ) );

	}

	const hidden = new Set();
	return rows.filter( ( row ) => {

		if ( row.parentId && ( hidden.has( row.parentId ) || collapsed.has( row.parentId ) ) ) {

			hidden.add( row.id );
			return false;

		}

		return true;

	} );

}
