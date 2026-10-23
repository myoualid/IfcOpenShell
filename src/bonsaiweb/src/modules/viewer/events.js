// This file was generated with the assistance of an AI coding tool.

// Viewer events → signals. Bonsai.start() hands the viewer's callbacks to
// these; they are reactions, not user actions, so they are not operators.

import { Signals } from '../../context/signals.js';
import { Federation } from '../../tool/federation.js';
import { measure } from '../../tool/measure.js';
import { Viewer } from '../../tool/Viewer.js';

// Clicks can overlap. A slower getObjects() for an earlier pick must not
// publish after a later one.
let pickGeneration = 0;
// A click runs publishSelection, then publishPick, in the same turn.
// A marquee only runs publishSelection. The serial lets the box-select
// path publish a pick without repeating the click path.
let viewportPickSerial = 0;
let boxGeneration = 0;

// A loaded v19 element row has guid/name/type. Before getObjects(), the
// selection read is only {objectId}. getObjects() builds the table for every
// loaded model, so it only runs while the row is missing.
async function elementRow( objectId ) {

	const viewer = Viewer.get();
	const find = () => viewer.getSelectedObjects().find( ( row ) => row.objectId === objectId );
	let row = find();
	if ( ! row || ! ( 'guid' in row || 'name' in row || 'type' in row ) ) {

		try {

			await viewer.getObjects();
			row = find();

		} catch { /* element table is not resident yet */ }

	}

	return row;

}

// The click payload is {objectId, guid, modelIndex, sourceId}. Name and IFC
// class live on the v19 element table. The spatial tree also publishes the
// row it selects through here.
export async function publishPick( pick ) {

	viewportPickSerial ++;
	const generation = ++ pickGeneration;
	if ( pick?.objectId ) await elementRow( pick.objectId );
	if ( generation === pickGeneration ) Signals.objectPicked.dispatch( pick );

}

export function publishSelection( ids ) {

	Signals.selectionChanged.dispatch( { ids } );
	if ( measure.mode() === 'volume' ) {

		measure.syncVolume( Viewer.get(), ids );
		Signals.measureChanged.dispatch( measure.snapshot() );

	}

	const serial = viewportPickSerial;
	const generation = ++ boxGeneration;
	queueMicrotask( async () => {

		const stale = () => serial !== viewportPickSerial || generation !== boxGeneration;
		if ( stale() ) return;
		if ( ! ids?.length ) {

			Signals.objectPicked.dispatch( null );
			return;

		}

		const activeId = Viewer.get().getActiveObject() || ids[ 0 ];
		const pick = await elementRow( activeId ) ?? { objectId: activeId };
		if ( ! stale() ) Signals.objectPicked.dispatch( pick );

	} );

}

// A model that belongs to a hidden federation group is hidden once it lands.
export async function publishModelLoaded( { sourceId, sessionModelId } ) {

	Signals.modelLoaded.dispatch( { sourceId, sessionModelId } );
	Federation.modelArrived();
	const model = Federation.modelForSource( sourceId );
	if ( ! model || Federation.isEffectivelyVisible( model ) ) return;

	try {

		const ids = ( await Viewer.get().getObjects() )
			.filter( ( object ) => object.sourceId === sourceId && object.objectId > 0 )
			.map( ( object ) => object.objectId );
		if ( ! ids.length ) return;
		Viewer.get().hide( ids );
		Signals.visibilityChanged.dispatch( { action: 'hide', target: ids } );

	} catch { /* element table is not resident yet */ }

}
