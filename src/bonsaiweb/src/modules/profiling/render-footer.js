import { StackPanel, Text } from '@aeco-dev/gui';

import { formatCount, formatObjects } from './metrics.js';

function stat( label, initial = '—' ) {

	const value = new Text( initial ).addClass( 'ProfilerFooter-statValue' );
	const item = new StackPanel( { isVertical: false } )
		.gap( '0.35rem' )
		.setStyle( 'alignItems', [ 'baseline' ] )
		.addClass( 'ProfilerFooter-stat' )
		.add( value, new Text( label ).addClass( 'ProfilerFooter-statLabel' ) );
	return { item, value };

}

/** Live object, triangle, and draw-call counts in the footer bar. */
export class RenderFooter {

	constructor( host ) {

		const objects = stat( 'objects' );
		const triangles = stat( 'triangles' );
		const drawCalls = stat( 'draw calls' );
		this.objects = objects.value;
		this.triangles = triangles.value;
		this.drawCalls = drawCalls.value;
		this.root = new StackPanel( { isVertical: false } )
			.gap( '0.75rem' )
			.setStyle( 'alignItems', [ 'baseline' ] )
			.addClass( 'ProfilerFooter-render' )
			.add( objects.item, triangles.item, drawCalls.item );

		host?.appendChild( this.root.dom );

	}

	update( snapshot ) {

		if ( ! this.root?.dom?.isConnected ) return;
		this.objects.setValue( formatObjects( snapshot.objectsVisible, snapshot.objectsTotal ) );
		this.triangles.setValue( formatObjects( snapshot.trianglesVisible, snapshot.trianglesTotal ) );
		this.drawCalls.setValue( formatCount( snapshot.drawCalls ) );

	}

	destroy() {

		this.root?.dom.remove();
		this.root = null;

	}

}
