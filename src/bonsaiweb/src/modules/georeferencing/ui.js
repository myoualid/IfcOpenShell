import {
	FloatingDialog,
	InputDropdown,
	InputNumber,
	Operator as IconButton,
	StackPanel,
	Text,
	Tooltip,
} from '@aeco-dev/gui';

import ops from '../../ops.js';
import { viewer } from '../../tool/Viewer.js';

const RIBBON_BUTTON_ID = 'RB_SurveyPoint';

const FEDERATION_UNITS = {
	'METRE|': 'metre',
	'METRE|MILLI': 'millimetre',
	'METRE|CENTI': 'centimetre',
	'foot|': 'foot',
	'inch|': 'inch',
};

const UNIT_BY_LABEL = {
	m: 'METRE|',
	mm: 'METRE|MILLI',
	cm: 'METRE|CENTI',
	ft: 'foot|',
	in: 'inch|',
};

function row( ...children ) {

	return new StackPanel( { isVertical: false } )
		.gap( '0.5rem' )
		.setStyle( 'alignItems', [ 'center' ] )
		.setStyle( 'flexWrap', [ 'wrap' ] )
		.add( ...children );

}

function fmtCoord( n ) {

	if ( ! Number.isFinite( n ) ) return '—';
	const abs = Math.abs( n );
	const digits = abs >= 1000 ? 2 : abs >= 10 ? 3 : 4;
	return n.toFixed( digits );

}

function coordInput() {

	const input = new InputNumber( 0 ).setPrecision( 4 ).setStep( 1 ).setNudge( 0.01 );
	input.setValue( 0 );
	input.setStyle( 'width', [ '100%' ] );
	return input;

}

function angleInput() {

	const input = new InputNumber( 0 ).setPrecision( 2 ).setStep( 1 ).setNudge( 0.1 );
	input.setValue( 0 );
	input.setStyle( 'width', [ '6rem' ] );
	return input;

}

function hint( control, text ) {

	new Tooltip( text ).attachTo( control );
	return control;

}

function labeled( label, control, tip ) {

	const caption = new Text( label );
	caption.setStyle( 'fontSize', [ '0.7rem' ] );
	if ( tip && ! control._hinted ) {

		hint( control, tip );
		control._hinted = true;

	}

	return new StackPanel( { isVertical: true } )
		.gap( '0.15rem' )
		.setStyle( 'flex', [ '1' ] )
		.setStyle( 'minWidth', [ '4.25rem' ] )
		.add( caption, control );

}

function helpButton( dialog ) {

	const button = new IconButton( 'help' );
	button.setTooltip( 'Help' );
	button.dom.addEventListener( 'click', ( event ) => {

		event.preventDefault();
		event.stopPropagation();
		if ( dialog.isActive ) dialog.hide();
		else dialog.show();

	} );
	return button;

}

function originFields( onEdit ) {

	const fields = {
		x: coordInput(),
		y: coordInput(),
		z: coordInput(),
		north: angleInput(),
		hold: false,
		seed: '',
	};
	for ( const input of [ fields.x, fields.y, fields.z, fields.north ] ) {

		input.dom.addEventListener( 'input', () => {

			fields.hold = true;
			onEdit( fields );

		} );
		input.onChange( () => onEdit( fields ) );

	}

	return fields;

}

function readLive( fields ) {

	const nums = [ fields.x, fields.y, fields.z, fields.north ].map( ( input ) => {

		const raw = input.dom.value.trim();
		if ( raw === '' || raw === '-' || raw === '.' || raw === '-.' ) return null;
		const n = Number( raw );
		return Number.isFinite( n ) ? n : null;

	} );
	if ( nums.some( ( n ) => n == null ) ) return null;
	return { xyz: nums.slice( 0, 3 ), rzDeg: nums[ 3 ] };

}

function readOrigin() {

	try {

		if ( ! viewer?.getFalseOrigin ) return null;
		return viewer.getFalseOrigin();

	} catch {

		return null;

	}

}

function originSeed( origin ) {

	return `${ origin.xyz.join( ',' ) }|${ origin.rzDeg }|${ origin.explicit }`;

}

function writeOrigin( fields, origin ) {

	const seed = originSeed( origin );
	if ( fields.hold || seed === fields.seed ) return;
	fields.seed = seed;
	fields.x.setValue( origin.xyz[ 0 ] );
	fields.y.setValue( origin.xyz[ 1 ] );
	fields.z.setValue( origin.xyz[ 2 ] );
	fields.north.setValue( origin.rzDeg );

}

class GeoreferencingPanelUI {

	static id = 'georeferencing';

	constructor( { context } ) {

		this.context = context;
		this._baseline = null;
		this._applying = false;
		this._survey = originFields( () => this._applySurvey() );
		this._unit = hint( new InputDropdown(), 'Federation unit. Changing the unit does not convert the numbers; it changes what a number means.' );
		this._unit.setOptions( FEDERATION_UNITS );
		this._unit.dom.setAttribute( 'aria-label', 'federation unit' );
		this._surveyPoint = new Text( 'Survey point  —' );
		this._worldOrigin = new Text( 'World origin  —' );
		this._marker = new Text( 'False origin  —' );
		this._georef = new Text( 'Load a model to read its map conversion.' );
		for ( const line of [ this._surveyPoint, this._worldOrigin, this._marker, this._georef ] ) {

			line.setStyle( 'whiteSpace', [ 'pre-wrap' ] );

		}

		this._unit.onChange( () => this._setUnit() );

		const surveyHelp = new FloatingDialog( {
			title: 'Survey point',
			icon: 'help',
			panelStyles: { width: '18rem' },
		} );
		surveyHelp.content( new StackPanel( { isVertical: true } ).gap( '0.5rem' ).add(
			new Text( 'X, Y, Z and grid north are the survey marker in the world. Typing them moves the marker. Models stay where they are. A model’s own X, Y, Z and grid north place that model in the same world, about this survey point. Sync puts the marker back where it was when the model was loaded.' ),
		) );

		const sync = new IconButton( 'sync' ).setTooltip( 'Reset survey point' );
		sync.setStyle( 'cursor', [ 'pointer' ] );
		sync.dom.addEventListener( 'click', ( event ) => {

			event.preventDefault();
			event.stopPropagation();
			this._reset();

		} );

		this.dialog = new FloatingDialog( {
			title: 'Survey point',
			icon: 'my_location',
			panelStyles: { width: '22rem' },
		} );
		this.dialog.content( new StackPanel( { isVertical: true } )
			.gap( '0.5rem' )
			.add(
				row( sync, helpButton( surveyHelp ) ),
				this._surveyPoint,
				this._worldOrigin,
				this._marker,
				this._georef,
				this._unit,
				row(
					labeled( 'X', this._survey.x, 'Survey marker X in the world. Does not move models.' ),
					labeled( 'Y', this._survey.y, 'Survey marker Y in the world. Does not move models.' ),
					labeled( 'Z', this._survey.z, 'Survey marker Z in the world. Does not move models.' ),
				),
				labeled( 'Grid north °', this._survey.north, 'Grid north of the survey point, in degrees. Turns the drawing frame, not the models.' ),
			) );
		this.dialog.onShow = () => {

			this.syncRibbon();
			this.refresh();

		};
		this.dialog.onHide = () => this.syncRibbon();

		context.georeferencing = context.georeferencing || {};
		context.georeferencing.panel = this;

		const { signals } = context;
		signals.viewerReady.add( () => this.refresh() );
		signals.modelLoaded.add( () => this.refresh() );
		signals.modelLoadedToGPU.add( () => this._paintGeoref() );
		signals.liveIfcReady.add( () => this.refresh() );
		signals.modelCleared.add( () => this.refresh() );

		this.refresh();

	}

	toggle() {

		this.dialog.toggle();
		return this;

	}

	isVisible() {

		return Boolean( this.dialog?.isActive );

	}

	syncRibbon() {

		document.getElementById( RIBBON_BUTTON_ID )?.classList.toggle( 'Active', this.isVisible() );

	}

	refresh() {

		this._syncSurvey();
		this._paintGeoref();

	}

	_syncSurvey() {

		const origin = readOrigin();
		if ( ! origin ) return;
		if ( ! this._survey.hold ) {

			this._baseline = { xyz: origin.xyz.slice(), rzDeg: origin.rzDeg };
			writeOrigin( this._survey, origin );

		}

		this._paintSurvey( origin );
		if ( ! this._unit.dom.matches( ':focus' ) ) {

			const key = UNIT_BY_LABEL[ origin.unit ];
			if ( key ) this._unit.setValue( key );

		}

	}

	_applySurvey() {

		if ( this._applying ) return;
		const pose = readLive( this._survey );
		if ( ! pose ) return;
		this._survey.hold = true;
		ops.execute( 'viewer.set_false_origin', this.context, pose );
		this._paintSurvey( { ...pose, explicit: true, unit: readOrigin()?.unit } );

	}

	_reset() {

		const origin = this._baseline ?? readOrigin();
		if ( ! origin ) return;
		this._applying = true;
		ops.execute( 'viewer.set_false_origin', this.context, {
			xyz: origin.xyz,
			rzDeg: origin.rzDeg,
		} );
		this._survey.hold = false;
		this._survey.seed = '';
		this._applying = false;
		this._syncSurvey();

	}

	_paintSurvey( origin ) {

		const unit = origin.unit || 'm';
		let survey = [ 0, 0, 0 ];
		let world = [ 0, 0, 0 ];
		try {

			if ( viewer.surveyPoint ) survey = viewer.surveyPoint();
			if ( viewer.worldOrigin ) world = viewer.worldOrigin();

		} catch { /* viewer is still booting */ }

		const mag = Math.hypot( origin.xyz[ 0 ], origin.xyz[ 1 ], origin.xyz[ 2 ] );
		const how = origin.explicit ? 'set by you' :
			( mag > 1e-4 || Math.abs( origin.rzDeg ) > 1e-3 ? 'guessed from the first model' : 'no shift yet' );
		this._surveyPoint.setValue( `Survey point  ${ survey.map( fmtCoord ).join( ', ' ) } m` );
		this._worldOrigin.setValue( `World origin  ${ world.map( fmtCoord ).join( ', ' ) } m` );
		this._marker.setValue(
			`False origin  ${ origin.xyz.map( fmtCoord ).join( ', ' ) } ${ unit }  ·  grid north ${ origin.rzDeg.toFixed( 2 ) }°  ·  ${ how }`,
		);

	}

	_paintGeoref() {

		const models = this.context.store.models;
		if ( ! models.length ) {

			this._georef.setValue( 'Load a model to read its map conversion.' );
			return;

		}

		const lines = [];
		for ( const entry of models ) {

			let georef = null;
			try {

				georef = viewer?.getModelGeoref?.( entry.id ) ?? null;

			} catch { /* model has not finished loading */ }

			const name = entry.name || `Model ${ entry.id }`;
			if ( ! georef ) {

				lines.push( `${ name }: still loading` );
				continue;

			}

			const map = georef.hasCoordinateOperation ? 'map conversion' : 'no map conversion';
			lines.push( `${ name }: ${ map }` );

		}

		this._georef.setValue( lines.join( '\n' ) );

	}

	_setUnit() {

		const [ name, prefix = '' ] = this._unit.getValue().split( '|' );
		ops.execute( 'viewer.set_federation_unit', this.context, { name, prefix } );
		this._syncSurvey();

	}

}

export default [ GeoreferencingPanelUI ];
