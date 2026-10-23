// bonsai.tool.Ifc — the live ifcopenshell files, keyed like the viewer.
//
// Each model is `{ id, name, file }`. `id` is the viewer source id
// (0, 1, 2, …). `file` is the ifcopenshell file, or null while only the
// .ifcview is loaded. `get()` returns that file: the last one stored,
// the one named, or the one with that id. `entity()` is null until a
// file is open. `globalId()` reads the selected element's GlobalId
// either way — the viewer pick carries it.

// 'ifcopenshell' is imported where it is used, never at the top: a static
// import would hold the session (and the GUI) until its CDN graph loads.
import { context } from '../context/context.js';
import { store } from '../context/store.js';

function dispose( file ) {

	try {

		file?.dispose?.();

	} catch { /* already disposed */ }

}

export class Ifc {

	// The live ifcopenshell file. With no key, the most recently stored
	// file (a view-only model is skipped). A string is a model name, with
	// or without ".ifc". A number is the viewer model id.
	// `bonsai.tool.Ifc.get()` with nothing loaded is null.
	static get( key ) {

		const { models } = store;
		if ( key === undefined ) return models.findLast( ( entry ) => entry.file )?.file ?? null;
		if ( typeof key === 'number' ) return models.find( ( entry ) => entry.id === key )?.file ?? null;
		if ( typeof key !== 'string' ) return null;

		// "house", "house.ifc", and "house.ifcview" are one model.
		const stem = ( name ) => String( name ).replace( /\.ifc(view)?$/i, '' ).toLowerCase();
		const want = stem( key );
		return models.findLast( ( entry ) => stem( entry.name ) === want )?.file ?? null;

	}

	// Register a model under a viewer source id. The same id updates that
	// row. Passing a file replaces and disposes the previous one; omitting
	// it leaves a live file in place. A new id is appended and is never
	// matched by name.
	static set( id, name, file ) {

		const { models } = store;
		const existing = models.find( ( entry ) => entry.id === id );
		if ( existing ) {

			if ( name ) existing.name = name;
			if ( file != null && file !== existing.file ) {

				dispose( existing.file );
				existing.file = file;

			}

			return existing;

		}

		const entry = { id, name, file: file ?? null };
		models.push( entry );
		return entry;

	}

	static clear() {

		for ( const entry of store.models ) dispose( entry.file );
		store.models.length = 0;

	}

	// GlobalId of the selected element. Pass a pick to read that one
	// instead of the current selection. Works in edit and in view: the
	// viewer pick's guid is the IFC GlobalId either way.
	static globalId( pick = context.activeObject ) {

		return pick?.guid || null;

	}

	// Blank IFC4 file: project → site → building → storey, with metric
	// units and a model context so later geometry has somewhere to live.
	// The caller keeps the file and registers it with set.
	static async createBlank( name = 'Project' ) {

		const ifcopenshell = await import( 'ifcopenshell' );
		const runtime = await ifcopenshell.init();
		if ( ! runtime.loadedPlugins().includes( 'schema:ifc4' ) ) {

			await runtime.loadPlugin( 'schema', 'ifc4' );

		}

		const file = new ifcopenshell.File( 'IFC4' );

		// 22-character IFC GlobalId. Same compress as ifcopenshell.guid.new.
		const guid = () => {

			const hex = `0000${ crypto.randomUUID().replace( /-/g, '' ) }`;
			const bytes = new Uint8Array( hex.length / 2 );
			for ( let i = 0; i < bytes.length; i ++ ) {

				bytes[ i ] = Number.parseInt( hex.slice( i * 2, i * 2 + 2 ), 16 );

			}

			const std = btoa( String.fromCharCode( ...bytes ) ).slice( 2 );
			const from = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
			const to = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
			let out = '';
			for ( const ch of std ) {

				const index = from.indexOf( ch );
				out += index >= 0 ? to[ index ] : ch;

			}

			return out;

		};

		const named = ( ifcClass, entityName ) => file.create( ifcClass, {
			GlobalId: guid(),
			Name: entityName,
		} );

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

		const project = named( 'IfcProject', name );
		project.set( 'RepresentationContexts', [ context ] );
		project.set( 'UnitsInContext', units );

		const site = named( 'IfcSite', 'Site' );
		const building = named( 'IfcBuilding', 'Building' );
		const storey = named( 'IfcBuildingStorey', 'Ground Floor' );
		const aggregate = ( parent, child ) => file.create( 'IfcRelAggregates', {
			GlobalId: guid(),
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
	static entity( pick = context.activeObject ) {

		if ( ! pick?.guid ) return null;
		const file = pick.sourceId == null ? null : Ifc.get( pick.sourceId );
		if ( ! file ) return null;
		try {

			return file.byGuid( pick.guid );

		} catch {

			return null;

		}

	}

}

export default Ifc;
