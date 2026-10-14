// bonsai.tool.Ifc — loaded models, and the one thing both modes share.
//
// Edit: a .ifc is open in ifcopenshell next to the .ifcview the viewer
// streams. View: only the .ifcview is loaded. `get()` returns the model
// record either way. `file()` and `entity()` are edit-only and return
// null in view mode. `globalId()` reads the selected element's GlobalId
// in both modes — the viewer pick carries it, and so does the live entity.

import * as ifcopenshell from 'ifcopenshell';
import { getStore } from '../session/store.js';

const STD64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const IFC64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

// 22-character IFC GlobalId. Same compress as ifcopenshell.guid.new.
function newGlobalId() {

	const hex = `0000${ crypto.randomUUID().replace( /-/g, '' ) }`;
	const bytes = new Uint8Array( hex.length / 2 );
	for ( let i = 0; i < bytes.length; i ++ ) {

		bytes[ i ] = Number.parseInt( hex.slice( i * 2, i * 2 + 2 ), 16 );

	}

	const std = btoa( String.fromCharCode( ...bytes ) ).slice( 2 );
	let out = '';
	for ( const ch of std ) {

		const index = STD64.indexOf( ch );
		out += index >= 0 ? IFC64[ index ] : ch;

	}

	return out;

}

function named( file, ifcClass, name ) {

	return file.create( ifcClass, {
		GlobalId: newGlobalId(),
		Name: name,
	} );

}

async function ensureSchema( schema ) {

	const runtime = await ifcopenshell.init();
	const id = schema.toLowerCase();
	if ( ! runtime.loadedPlugins().includes( `schema:${ id }` ) ) {

		await runtime.loadPlugin( 'schema', id );

	}

}

function dispose( file ) {

	try {

		file?.dispose?.();

	} catch { /* already disposed */ }

}

function findModel( sourceId, name ) {

	if ( sourceId != null ) {

		const bySource = getStore().models.find( ( entry ) => entry.sourceId === sourceId );
		if ( bySource ) return bySource;

	}

	if ( ! name ) return undefined;
	// Same filename, but not an entry already bound to a different source —
	// stealing that row would detach the live IFC from geometry still in
	// the scene.
	return getStore().models.find( ( entry ) =>
		( entry.sourceId == null || entry.sourceId === sourceId ) &&
		( entry.name === name || entry.viewName === name )
	);

}

export class Ifc {

	static EDIT = 'edit';
	static VIEW = 'view';

	static all() {

		return getStore().models;

	}

	// The model record. With no key, the selected element's model, or the
	// most recently opened model when nothing is selected. A key may be a
	// filename (.ifc or .ifcview), a sourceId, or a viewer pick.
	// `bonsai.tool.Ifc.get()` with nothing loaded is null.
	static get( key ) {

		if ( key === undefined ) {

			if ( getStore().selection ) {

				const selected = Ifc.get( getStore().selection );
				if ( selected ) return selected;

			}

			return getStore().models.at( - 1 ) ?? null;

		}

		if ( key === null ) return null;
		if ( typeof key === 'object' ) {

			if ( key.sourceId == null ) return null;
			return getStore().models.find( ( entry ) => entry.sourceId === key.sourceId ) ?? null;

		}

		return getStore().models.find( ( entry ) =>
			entry.sourceId === key || entry.name === key || entry.viewName === key
		) ?? null;

	}

	// 'edit', 'view', or null. Same key rules as get().
	static mode( key ) {

		return Ifc.get( key )?.mode ?? null;

	}

	static isEdit( key ) {

		return Ifc.mode( key ) === Ifc.EDIT;

	}
	static isView( key ) {

		return Ifc.mode( key ) === Ifc.VIEW;

	}

	// The live ifcopenshell file. Null in view mode and when nothing matches.
	static file( key ) {

		const model = Ifc.get( key );
		if ( model?.mode !== Ifc.EDIT ) return null;
		return model.file ?? null;

	}

	static has( key ) {

		if ( key === undefined ) return getStore().models.length > 0;
		return Ifc.get( key ) != null;

	}

	// Geometry-only model (.ifcview, no live file). Re-opening the same
	// source refreshes that entry. The same source already in edit mode
	// keeps its file. A new source with the same view name is a separate
	// model — it must not steal the row that is already paired with a
	// live IFC in the scene.
	static setView( sourceId, viewName ) {

		const existing = findModel( sourceId, viewName );
		if ( existing ) {

			const sameSource = existing.sourceId === sourceId;
			existing.sourceId = sourceId;
			existing.viewName = viewName;
			// Same source already promoted to edit: keep the live file.
			// A new source reusing this view name starts over as view.
			if ( sameSource && existing.mode === Ifc.EDIT ) return existing;
			if ( existing.file ) dispose( existing.file );
			existing.name = viewName;
			existing.mode = Ifc.VIEW;
			existing.file = null;
			return existing;

		}

		const entry = {
			sourceId,
			name: viewName,
			viewName,
			mode: Ifc.VIEW,
			file: null,
		};
		getStore().models.push( entry );
		return entry;

	}

	// Live .ifc opened beside the .ifcview. Promotes a view entry for the
	// same source. Re-opening replaces the previous file and disposes it.
	static setEdit( sourceId, file, name ) {

		const existing = findModel( sourceId, name );
		if ( existing ) {

			if ( existing.file && existing.file !== file ) dispose( existing.file );
			existing.sourceId = sourceId;
			existing.name = name;
			existing.mode = Ifc.EDIT;
			existing.file = file;
			return existing;

		}

		const entry = {
			sourceId,
			name,
			viewName: null,
			mode: Ifc.EDIT,
			file,
		};
		getStore().models.push( entry );
		return entry;

	}

	static clear() {

		for ( const entry of getStore().models ) dispose( entry.file );
		getStore().models.length = 0;
		getStore().selection = null;

	}

	// GlobalId of the selected element. Pass a pick to read that one
	// instead of the current selection. Works in edit and in view: the
	// viewer pick's guid is the IFC GlobalId either way.
	static globalId( pick ) {

		const target = pick === undefined ? getStore().selection : pick;
		if ( ! target || typeof target !== 'object' ) return null;
		return target.guid || null;

	}

	// Blank IFC4 file: project → site → building → storey, with metric
	// units and a model context so later geometry has somewhere to live.
	// The caller keeps the file and registers it with setEdit.
	static async createBlank( name = 'Project' ) {

		await ensureSchema( 'IFC4' );
		const file = new ifcopenshell.File( 'IFC4' );

		const origin = file.create( 'IfcCartesianPoint', { Coordinates: [ 0, 0, 0 ] } );
		const placement = file.create( 'IfcAxis2Placement3D', { Location: origin } );
		const context = file.create( 'IfcGeometricRepresentationContext', {
			ContextType: 'Model',
			CoordinateSpaceDimension: 3,
			Precision: 1e-5,
			WorldCoordinateSystem: placement,
		} );
		const units = file.create( 'IfcUnitAssignment', {
			Units: [
				file.create( 'IfcSIUnit', { UnitType: 'LENGTHUNIT', Prefix: 'MILLI', Name: 'METRE' } ),
				file.create( 'IfcSIUnit', { UnitType: 'AREAUNIT', Name: 'SQUARE_METRE' } ),
				file.create( 'IfcSIUnit', { UnitType: 'VOLUMEUNIT', Name: 'CUBIC_METRE' } ),
			],
		} );

		const project = named( file, 'IfcProject', name );
		project.set( 'RepresentationContexts', [ context ] );
		project.set( 'UnitsInContext', units );

		const site = named( file, 'IfcSite', 'Site' );
		const building = named( file, 'IfcBuilding', 'Building' );
		const storey = named( file, 'IfcBuildingStorey', 'Ground Floor' );
		const aggregate = ( parent, child ) => file.create( 'IfcRelAggregates', {
			GlobalId: newGlobalId(),
			RelatingObject: parent,
			RelatedObjects: [ child ],
		} );
		aggregate( project, site );
		aggregate( site, building );
		aggregate( building, storey );

		return file;

	}

	// Live entity for a pick, or for the current selection when called
	// with no argument. View mode has no entity and returns null.
	static entity( pick ) {

		const target = pick === undefined ? getStore().selection : pick;
		if ( ! target?.guid ) return null;
		const file = Ifc.file( target );
		if ( ! file ) return null;
		try {

			return file.byGuid( target.guid );

		} catch {

			return null;

		}

	}

}

export default Ifc;
