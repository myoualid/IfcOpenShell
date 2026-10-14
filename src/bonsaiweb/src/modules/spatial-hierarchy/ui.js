import {
	Operator,
	StackPanel,
	TreeView,
} from '@aeco-dev/gui';

import { ViewerObjectPicked } from '../viewer/operators.js';
import { Element } from '../../tool/index.js';
import {
	HideSelectionOperator,
	ShowSelectionOperator,
	SpatialIsolate,
	SpatialObjects,
	SpatialSelect,
} from './operators.js';

function isSpatialContainerNode( row ) {

	if ( ! row || row.kind !== 'spatial' ) return false;
	if ( row.isStructure === false ) return false;
	return true;

}

function decompositionNodeToHierarchy( node, sourceId ) {

	const children = ( node.children ?? [] ).map( ( child ) =>
		decompositionNodeToHierarchy( child, sourceId ),
	);
	const isStructure = node.isStructure !== false;
	return {
		nodeId: `spatial:${ sourceId }:${ node.id }`,
		kind: 'spatial',
		label: node.name?.trim() || node.type || `Entity #${ node.id }`,
		subtitle: node.type,
		children,
		sourceId,
		guid: node.guid || undefined,
		ifcId: node.id,
		ifcType: node.type,
		isStructure,
	};

}

function buildModelHierarchyRoot( sourceId, label, spatialDecomposition ) {

	const children = Array.isArray( spatialDecomposition )
		? spatialDecomposition.map( ( node ) => decompositionNodeToHierarchy( node, sourceId ) )
		: [];
	return {
		nodeId: `model:${ sourceId }`,
		kind: 'model',
		label,
		subtitle: children.length ? undefined : 'Waiting for live IFC…',
		children,
		sourceId,
		visible: true,
	};

}

function collectSubtreeGuids( row, out = [] ) {

	if ( ! row ) return out;
	if ( row.kind === 'spatial' && row.guid ) out.push( row.guid );
	if ( isSpatialContainerNode( row ) || row.kind === 'model' ) {

		for ( const child of row.children ?? [] ) collectSubtreeGuids( child, out );

	}

	return out;

}

function findNodeByGuid( roots, guid ) {

	if ( ! guid ) return null;
	for ( const root of roots ) {

		const found = walkFind( root, ( node ) => node.guid === guid );
		if ( found ) return found;

	}

	return null;

}

function walkFind( node, predicate ) {

	if ( predicate( node ) ) return node;
	for ( const child of node.children ?? [] ) {

		const found = walkFind( child, predicate );
		if ( found ) return found;

	}

	return null;

}

function actionsRow( ...children ) {

	return new StackPanel( { isVertical: false } )
		.gap( '0.15rem' )
		.setStyle( 'alignItems', [ 'center' ] )
		.setStyle( 'marginLeft', [ 'auto' ] )
		.add( ...children );

}

function actionButton( icon, tooltip, onClick ) {

	const btn = new Operator( icon );
	btn.dom.title = tooltip;
	btn.dom.setAttribute( 'aria-label', tooltip );
	btn.onClick( ( event ) => {

		event.preventDefault();
		event.stopPropagation();
		onClick();

	} );
	return btn;

}

class SpatialHierarchyPanelUI {

	static id = 'spatial-hierarchy';

	static spec = {
		group: 'spatial-structure',
		position: 'left',
		id: 'spatial-panel',
		label: 'Spatial',
		icon: 'account_tree',
		title: 'Navigator',
	};

	constructor( { context } ) {

		this.context = context;
		this._roots = [];
		/** @type {Map<string, number>} */
		this._guidToObjectId = new Map();
		/** @type {string | null} */
		this._selectedNodeId = null;
		/** @type {'tree' | 'viewport' | null} */
		this._selectionOrigin = null;
		/** @type {MouseEvent | null} */
		this._lastPointerEvent = null;


		this._tree = new TreeView( {
			getLabel: ( item ) => item.label,
			getChildren: ( item ) => item.children || [],
			getId: ( item ) => item.nodeId,
			emptyMessage: '',
			expandRoot: true,
			onItemClick: ( item ) => {

				if ( item.kind === 'model' ) return;
				void this._selectFromTree( item, this._modsFromEvent( this._lastPointerEvent ) );

			},
			renderItem: ( item, tree, depth ) => this._renderItem( item, tree, depth ),
		} );

		this.root = new StackPanel( { isVertical: true } )
			.gap( '0.5rem' )
			.add( this._tree.panel );

		const { signals } = context;
		signals.modelLoaded.add( () => void this.refresh() );
		signals.liveIfcReady.add( () => void this.refresh() );
		signals.modelCleared.add( () => {

			this._roots = [];
			this._guidToObjectId.clear();
			this._selectedNodeId = null;
			this._selectionOrigin = null;
			this._tree.setData( null );

		} );
		signals.objectPicked.add( ( pick ) => this._onViewportSelection( pick ) );

		void this.refresh();

	}

	async refresh() {

		const { result: objects } = await new SpatialObjects( this.context ).run();
		this._guidToObjectId.clear();
		for ( const obj of objects ?? [] ) {

			if ( obj.guid && obj.objectId > 0 ) this._guidToObjectId.set( obj.guid, obj.objectId );

		}

		this._roots = this.context.store.models.map( ( entry ) => {

			const file = entry.mode === 'edit' ? entry.file : null;
			const decomposition = file ? Element.getSpatialDecomposition( file ) : [];
			return buildModelHierarchyRoot(
				entry.sourceId,
				entry.name || entry.viewName || `Model ${ entry.sourceId }`,
				decomposition,
			);

		} );

		this._renderTree();

	}

	_onViewportSelection( pick ) {

		if ( ! pick?.guid ) return;
		if ( this._selectionOrigin === 'tree' ) {

			this._selectionOrigin = null;
			return;

		}

		const node = findNodeByGuid( this._roots, pick.guid );
		if ( ! node ) return;
		this._selectionOrigin = 'viewport';
		this._selectedNodeId = node.nodeId;
		this._selectNode( node.nodeId );

	}

	async _selectFromTree( item, mods ) {

		const objectIds = this._objectIdsForNode( item );
		if ( objectIds.length === 0 ) return;

		this._selectionOrigin = 'tree';
		this._selectedNodeId = item.nodeId;
		this._selectNode( item.nodeId );

		new SpatialSelect( this.context, objectIds, mods ).run();

		await this._publishActivePick( objectIds[ 0 ], item );

	}

	async _runAction( item, action ) {

		const objectIds = this._objectIdsForNode( item );
		if ( objectIds.length === 0 && action !== 'show' ) return;

		if ( action === 'hide' ) {

			new HideSelectionOperator( this.context, objectIds ).run();
			return;

		}

		if ( action === 'show' ) {

			new ShowSelectionOperator( this.context, objectIds ).run();
			return;

		}

		if ( action === 'isolate' ) {

			this._selectionOrigin = 'tree';
			this._selectedNodeId = item.nodeId;
			this._selectNode( item.nodeId );
			new SpatialIsolate( this.context, objectIds ).run();
			await this._publishActivePick( objectIds[ 0 ], item );

		}

	}

	async _publishActivePick( objectId, item ) {

		if ( ! objectId ) return;
		const { result: objects } = await new SpatialObjects( this.context ).run();
		let pick = ( objects ?? [] ).find( ( object ) => object.objectId === objectId ) ?? null;

		if ( ! pick ) {

			pick = {
				objectId,
				guid: item.guid || undefined,
				sourceId: item.sourceId,
				type: item.ifcType,
				name: item.label,
			};

		}

		new ViewerObjectPicked( this.context, pick ).run();

	}

	_objectIdsForNode( item ) {

		if ( item.kind === 'model' || isSpatialContainerNode( item ) ) {

			return this._resolveObjectIds( collectSubtreeGuids( item ) );

		}

		if ( item.guid ) {

			const id = this._guidToObjectId.get( item.guid );
			return id ? [ id ] : [];

		}

		return [];

	}

	_resolveObjectIds( guids ) {

		const ids = [];
		const seen = new Set();
		for ( const guid of guids ) {

			const id = this._guidToObjectId.get( guid );
			if ( id && ! seen.has( id ) ) {

				seen.add( id );
				ids.push( id );

			}

		}

		return ids;

	}

	_renderTree() {

		if ( this._roots.length === 0 ) {

			this._tree.setData( null );
			return;

		}

		this._tree.setData( this._roots );
		this._selectNode( this._selectedNodeId );

	}

	_selectNode( nodeId ) {

		if ( ! nodeId || ! this._tree.rootData ) {

			this._tree.setSelected( null );
			return;

		}

		const roots = Array.isArray( this._tree.rootData ) ? this._tree.rootData : [ this._tree.rootData ];
		this._tree.setSelected( findById( roots, nodeId ) );

	}

	_modsFromEvent( event ) {

		if ( event?.shiftKey ) return 'add';
		if ( event?.ctrlKey || event?.metaKey ) return 'remove';
		return 'replace';

	}

	_renderItem( item, tree, depth ) {

		const row = tree.defaultRenderItem( item, tree, depth );
		row.dom.addEventListener( 'mousedown', ( event ) => {

			this._lastPointerEvent = event;

		} );

		if ( item.kind === 'spatial' ) {

			row.dom.title = 'Click to select in viewport (Shift add, Ctrl remove)';
			const label = row.dom.querySelector( '.TreeView-label' );
			if ( label && item.subtitle ) {

				label.textContent = item.label;
				const caption = document.createElement( 'span' );
				caption.className = 'Caption';
				caption.style.marginLeft = '0.35rem';
				caption.style.opacity = '0.7';
				caption.textContent = item.subtitle;
				label.parentElement?.appendChild( caption );

			}

			row.add( actionsRow(
				actionButton( 'visibility_off', 'Hide', () => void this._runAction( item, 'hide' ) ),
				actionButton( 'visibility', 'Show', () => void this._runAction( item, 'show' ) ),
				actionButton( 'filter_center_focus', 'Isolate', () => void this._runAction( item, 'isolate' ) ),
			) );

		}

		return row;

	}

}

function findById( roots, nodeId ) {

	for ( const root of roots ) {

		const found = walk( root );
		if ( found ) return found;

	}

	return null;

	function walk( node ) {

		if ( node.nodeId === nodeId ) return node;
		for ( const child of node.children ?? [] ) {

			const hit = walk( child );
			if ( hit ) return hit;

		}

		return null;

	}

}

export default [ SpatialHierarchyPanelUI ];
