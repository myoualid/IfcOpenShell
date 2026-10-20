import { onViewerTools } from '../../tool/viewerTools.js';

const BUTTONS = {
	RB_Section: 'section',
	RB_Fly: 'fly',
	RB_Ortho: 'ortho',
	RB_Grid: 'grid',
	RB_Axes: 'axes',
	RB_Fog: 'fog',
	RB_Xray: 'xray',
};

class ViewerToolsUI {

	static id = 'viewer';

	constructor( { context } ) {

		this.hint = document.createElement( 'div' );
		this.hint.id = 'viewer-tool-hint';
		this.hint.hidden = true;
		context.dom?.viewport?.appendChild( this.hint );
		this._off = onViewerTools( ( state ) => this.sync( state ) );
		context.signals.viewerToolsChanged.add( ( state ) => this.sync( state ) );

	}

	sync( state ) {

		if ( ! state ) return;
		for ( const [ id, key ] of Object.entries( BUTTONS ) ) {

			const el = document.getElementById( id );
			if ( ! el ) continue;
			const on = !! state[ key ];
			el.classList.toggle( 'Active', on );
			el.setAttribute( 'aria-pressed', String( on ) );

		}

		const lines = [];
		if ( state.section ) lines.push( 'Section — click a surface to cut. Drag the arrow to slide it. Delete removes the last cut.' );
		if ( state.fly ) lines.push( 'Fly — WASD and QE move, the mouse looks, Shift boosts, Esc exits.' );
		this.hint.hidden = lines.length === 0;
		this.hint.textContent = lines.join( '\n' );

	}

}

export default [ ViewerToolsUI ];
