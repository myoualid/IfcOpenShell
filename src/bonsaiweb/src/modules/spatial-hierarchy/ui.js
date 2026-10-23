import {
	NavigationList,
	Operator,
	StackPanel,
	Text,
	TreeView,
} from '@aeco-dev/gui';

import ops from '../../ops.js';
import { ensureElementChildren, getSpatialDecomposition } from '../../tool/elementQuery.js';

function decompositionNodeToHierarchy( node, sourceId ) {

	const item = {
		nodeId: `spatial:${ sourceId }:${ node.id }`,
		kind: 'spatial',
		label: node.name,
		subtitle: node.type,
		children: node.children.map( ( child ) => decompositionNodeToHierarchy( child, sourceId ) ),
		sourceId,
		guid: node.guid || undefined,
		ifcId: node.id,
		ifcType: node.type,
		isContainer: node.isContainer,
		_lazySource: node._lazySource,
	};
	return item;

}

function buildModelHierarchyRoot( sourceId, label, spatialDecomposition ) {

	const children = spatialDecomposition.map( ( node ) => decompositionNodeToHierarchy( node, sourceId ) );
	return {
		nodeId: `model:${ sourceId }`,
		kind: 'model',
		label,
		subtitle: children.length ? undefined : 'Waiting for live IFC…',
		children,
		sourceId,
	};

}

// A row click selects that entity and shows its properties, the same as a
// scene pick. Expand, drill-down, hide, and isolate stay on their controls.
// NavigationList shows one node's children. One model is that root; several
// models share a synthetic parent so the first screen is the model list.
function navigationRoot( roots ) {

	if ( roots.length === 1 ) return roots[ 0 ];
	return {
		nodeId: 'spatial:models',
		kind: 'models',
		label: 'Models',
		children: roots,
	};

}

function pathToNode( root, nodeId ) {

	if ( ! root || ! nodeId ) return null;
	const path = [];
	return walk( root ) ? path : null;

	function walk( node ) {

		path.push( node );
		if ( node.nodeId === nodeId ) return true;
		for ( const child of node.children ?? [] ) {

			if ( walk( child ) ) return true;

		}

		path.pop();
		return false;

	}

}

function assignObjectIds( node, guidToObjectId ) {

	const ids = new Set();
	const own = node.guid ? guidToObjectId.get( node.guid ) : undefined;
	node.objectId = own;
	if ( own ) ids.add( own );
	for ( const child of node.children ) {

		for ( const id of assignObjectIds( child, guidToObjectId ) ) ids.add( id );

	}

	node.objectIds = [ ...ids ];
	return node.objectIds;

}

function hiddenCount( objectIds, hidden ) {

	let count = 0;
	for ( const id of objectIds ) if ( hidden.has( id ) ) count += 1;
	return count;

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
		.addClass( 'SpatialTree-actions' )
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
		/** @type {Map<number, object>} */
		this._rootBySourceId = new Map();
		/** @type {Map<string, number>} */
		this._guidToObjectId = new Map();
		/** @type {Set<number>} */
		this._hidden = new Set();
		/** @type {string | null} */
		this._selectedNodeId = null;
		/** @type {'tree' | 'list'} */
		this._viewMode = 'tree';
		/** @type {'panel' | 'viewport' | null} */
		this._selectionOrigin = null;
		/** @type {MouseEvent | null} */
		this._lastPointerEvent = null;

		const hierarchyOptions = {
			getLabel: ( item ) => item.label,
			getChildren: ( item ) => this._childrenOf( item ),
			emptyMessage: '',
			onItemClick: ( item ) => {

				if ( item.kind === 'model' || item.kind === 'models' || item.kind === 'pending' ) return;
				void this._selectFromPanel( item, this._modsFromEvent( this._lastPointerEvent ) );

			},
		};

		this._tree = new TreeView( {
			...hierarchyOptions,
			getId: ( item ) => item.nodeId,
			expandRoot: true,
			renderItem: ( item, tree, depth ) => this._renderItem( item, tree, depth ),
		} );
		this._tree.panel.addClass( 'SpatialTree' );

		this._list = new NavigationList( {
			...hierarchyOptions,
			getTitle: ( item ) => item.label || 'Spatial',
			autoNavigate: false,
			onNavigate: ( item ) => {

				this._list.emptyMessage = item?.subtitle || '';

			},
			renderItem: ( item, list ) => this._renderItem( item, list ),
		} );
		this._list.panel.addClass( 'SpatialNav' );

		this._treeModeBtn = actionButton( 'account_tree', 'Tree view', () => this._setViewMode( 'tree' ) );
		this._listModeBtn = actionButton( 'view_list', 'Navigation list', () => this._setViewMode( 'list' ) );
		this._viewBar = new StackPanel( { isVertical: false } )
			.addClass( 'SpatialNavigator-viewbar' )
			.gap( '0.15rem' )
			.setStyle( 'alignItems', [ 'center' ] )
			.add( this._treeModeBtn, this._listModeBtn );
		this._viewBar.dom.setAttribute( 'role', 'group' );
		this._viewBar.dom.setAttribute( 'aria-label', 'Spatial view' );

		this._hiddenCaption = new Text( '' );
		this._summary = new StackPanel( { isVertical: false } )
			.addClass( 'SpatialTree-summary' )
			.gap( '0.25rem' )
			.setStyle( 'alignItems', [ 'center' ] )
			.add(
				this._hiddenCaption,
				actionsRow( actionButton( 'visibility', 'Show all', () => ops.execute( 'show.all', this.context ) ) ),
			);
		this._summary.dom.hidden = true;

		this._views = new StackPanel( { isVertical: true } )
			.addClass( 'SpatialNavigator-views' )
			.add( this._tree.panel, this._list.panel );

		this.root = new StackPanel( { isVertical: true } )
			.addClass( 'SpatialNavigator' )
			.gap( '0.5rem' )
			.add( this._viewBar, this._summary, this._views );

		this._syncViewChrome();

		const { signals } = context;
		signals.modelLoaded.add( ( payload ) => void this.refreshGuids( payload ) );
		signals.liveIfcReady.add( ( payload ) => void this.refresh( payload ) );
		signals.modelCleared.add( () => {

			this._roots = [];
			this._rootBySourceId.clear();
			this._guidToObjectId.clear();
			this._hidden.clear();
			this._selectedNodeId = null;
			this._selectionOrigin = null;
			this._updateSummary();
			this._tree.setData( null );
			this._clearList();

		} );
		signals.objectPicked.add( ( pick ) => this._onViewportSelection( pick ) );
		signals.visibilityChanged.add( () => void this._refreshVisibility() );

		void this.refresh();

	}

	async refreshGuids() {

		const { result: objects } = await ops.execute( 'spatial.objects', this.context );
		this._guidToObjectId.clear();
		for ( const obj of objects ?? [] ) {

			if ( obj.guid && obj.objectId > 0 ) this._guidToObjectId.set( obj.guid, obj.objectId );

		}

		for ( const root of this._roots ) assignObjectIds( root, this._guidToObjectId );
		this._tree.refresh?.();
		if ( this._list.currentData ) this._list.refresh();

	}

	async refresh( payload ) {

		await this.refreshGuids();
		const wanted = payload?.sourceId;
		const models = this.context.store.models;
		this._roots = models.map( ( entry ) => {

			if ( wanted != null && entry.id !== wanted && this._rootBySourceId.has( entry.id ) ) {

				return this._rootBySourceId.get( entry.id );

			}

			const root = buildModelHierarchyRoot(
				entry.id,
				entry.name || `Model ${ entry.id }`,
				entry.file ? getSpatialDecomposition( entry.file ) : [],
			);
			assignObjectIds( root, this._guidToObjectId );
			this._rootBySourceId.set( entry.id, root );
			return root;

		} );
		const live = new Set( models.map( ( entry ) => entry.id ) );
		for ( const sourceId of [ ...this._rootBySourceId.keys() ] ) {

			if ( ! live.has( sourceId ) ) this._rootBySourceId.delete( sourceId );

		}

		await this._loadHidden();
		this._renderViews();

	}

	_childrenOf( item ) {

		if ( ! item ) return [];
		if ( item._lazySource ) {

			const expanded = this._tree.expandedIds.has( item.nodeId )
				|| ( this._viewMode === 'list' && this._list.currentData === item );
			if ( expanded ) this._expandLazy( item, false );
			else if ( ! ( item.children && item.children.length ) ) {

				return [ { nodeId: `${ item.nodeId }:pending`, kind: 'pending', label: '', children: [] } ];

			}

		}

		return item.children || [];

	}

	_expandLazy( item, recursive ) {

		if ( item?._lazySource ) {

			ensureElementChildren( item );
			item.children = ( item.children ?? [] ).map( ( child ) =>
				child.kind ? child : decompositionNodeToHierarchy( child, item.sourceId ),
			);
			assignObjectIds( item, this._guidToObjectId );

		}

		if ( recursive ) {

			for ( const child of item.children ?? [] ) this._expandLazy( child, true );

		}

	}

	async _loadHidden() {

		const { result: hidden } = await ops.execute( 'spatial.hidden', this.context );
		this._hidden = hidden ?? new Set();
		this._updateSummary();

	}

	async _refreshVisibility() {

		await this._loadHidden();
		this._tree.refresh();
		if ( this._list.currentData ) this._list.refresh();

	}

	_setViewMode( mode ) {

		if ( mode !== 'tree' && mode !== 'list' ) return;
		this._viewMode = mode;
		this._syncViewChrome();
		if ( mode === 'list' ) this._showSelectionInList();

	}

	_syncViewChrome() {

		const list = this._viewMode === 'list';
		this._treeModeBtn.toggleClass( 'is-active', ! list );
		this._listModeBtn.toggleClass( 'is-active', list );
		this._treeModeBtn.dom.setAttribute( 'aria-pressed', String( ! list ) );
		this._listModeBtn.dom.setAttribute( 'aria-pressed', String( list ) );
		this._tree.panel.dom.hidden = list;
		this._list.panel.dom.hidden = ! list;

	}

	_updateSummary() {

		const count = this._hidden.size;
		this._summary.dom.hidden = count === 0;
		this._hiddenCaption.setValue( `${ count } object${ count === 1 ? '' : 's' } hidden` );

	}

	_onViewportSelection( pick ) {

		if ( ! pick?.guid ) {

			if ( ! pick?.objectId ) {

				this._selectedNodeId = null;
				this._selectionOrigin = null;
				this._selectNode( null );

			}

			return;

		}
		if ( this._selectionOrigin === 'panel' ) {

			this._selectionOrigin = null;
			return;

		}

		const node = findNodeByGuid( this._roots, pick.guid );
		if ( ! node ) return;
		this._selectionOrigin = 'viewport';
		this._selectedNodeId = node.nodeId;
		this._selectNode( node.nodeId );

	}

	async _selectFromPanel( item, mods ) {

		this._selectionOrigin = 'panel';
		this._selectedNodeId = item.nodeId;
		this._selectNode( item.nodeId );

		// The row is one entity. Subtree ids stay with hide, show, and isolate.
		if ( item.objectId ) {

			ops.execute( 'spatial.select', this.context, [ item.objectId ], mods );
			await this._publishActivePick( item.objectId, item );
			return;

		}

		if ( ! item.guid ) return;
		ops.execute( 'viewer.object_picked', this.context, {
			guid: item.guid,
			sourceId: item.sourceId,
			type: item.ifcType,
			name: item.label,
		} );

	}

	async _runAction( item, action ) {

		this._expandLazy( item, true );
		const objectIds = item.objectIds ?? [];
		if ( objectIds.length === 0 ) return;

		if ( action === 'hide' ) {

			ops.execute( 'hide.selection', this.context, objectIds );
			return;

		}

		if ( action === 'show' ) {

			ops.execute( 'show.selection', this.context, objectIds );
			return;

		}

		if ( action === 'isolate' ) {

			this._selectionOrigin = 'panel';
			this._selectedNodeId = item.nodeId;
			this._selectNode( item.nodeId );
			ops.execute( 'spatial.isolate', this.context, objectIds );
			await this._publishActivePick( objectIds[ 0 ], item );

		}

	}

	async _publishActivePick( objectId, item ) {

		if ( ! objectId ) return;
		const { result: objects } = await ops.execute( 'spatial.objects', this.context );
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

		ops.execute( 'viewer.object_picked', this.context, pick );

	}

	_renderViews() {

		if ( this._roots.length === 0 ) {

			this._tree.setData( null );
			this._clearList();
			return;

		}

		this._tree.setData( this._roots );
		const root = navigationRoot( this._roots );
		this._list.emptyMessage = root.subtitle || '';
		this._list.setData( root );
		this._selectNode( this._selectedNodeId );

	}

	_clearList() {

		this._list.rootData = null;
		this._list.currentData = null;
		this._list.history = [];
		this._list.content.clear();
		this._list.header.setTitle( '' );
		this._list.header.setLeadingActions( [] );

	}

	// Open the parent of the selected row so that row is on screen.
	_showSelectionInList() {

		const root = this._list.rootData;
		if ( ! root ) return;

		const path = pathToNode( root, this._selectedNodeId );
		if ( ! path || path.length < 2 ) {

			this._list.history = [];
			this._list.currentData = root;

		} else {

			this._list.history = path.slice( 0, - 2 );
			this._list.currentData = path[ path.length - 2 ];

		}

		this._list.emptyMessage = this._list.currentData?.subtitle || '';
		this._list.refresh();

	}

	_selectNode( nodeId ) {

		if ( ! nodeId || ! this._tree.rootData ) {

			this._tree.setSelected( null );

		} else {

			const roots = Array.isArray( this._tree.rootData ) ? this._tree.rootData : [ this._tree.rootData ];
			this._tree.setSelected( findById( roots, nodeId ) );

		}

		if ( this._viewMode === 'list' ) this._showSelectionInList();

	}

	_modsFromEvent( event ) {

		if ( event?.shiftKey ) return 'add';
		if ( event?.ctrlKey || event?.metaKey ) return 'remove';
		return 'replace';

	}

	_renderItem( item, view, depth ) {

		const row = view.defaultRenderItem( item, view, depth );
		row.dom.addEventListener( 'mousedown', ( event ) => {

			this._lastPointerEvent = event;

		} );

		if ( item.nodeId && item.nodeId === this._selectedNodeId ) row.addClass( 'is-selected' );

		if ( item.kind === 'spatial' ) {

			row.dom.title = 'Click to select (Shift add, Ctrl remove)';
			const label = row.dom.querySelector( '.TreeView-label, .NavigationList-label' );
			if ( label && item.subtitle ) {

				const caption = document.createElement( 'span' );
				caption.className = 'Caption SpatialTree-type';
				caption.textContent = item.subtitle;
				label.insertAdjacentElement( 'afterend', caption );

			}

		}

		const chevron = row.dom.querySelector( '.NavigationList-chevron' );
		if ( chevron && typeof view.navigateTo === 'function' ) {

			chevron.setAttribute( 'role', 'button' );
			chevron.setAttribute( 'aria-label', 'Open' );
			chevron.removeAttribute( 'aria-hidden' );
			chevron.tabIndex = 0;
			const open = ( event ) => {

				event.preventDefault();
				event.stopPropagation();
				view.navigateTo( item );

			};

			chevron.addEventListener( 'click', open );
			chevron.addEventListener( 'keydown', ( event ) => {

				if ( event.key !== 'Enter' && event.key !== ' ' && event.code !== 'Space' ) return;
				open( event );

			} );

		}

		const objectIds = item.objectIds ?? [];
		if ( objectIds.length === 0 ) return row;

		const hidden = hiddenCount( objectIds, this._hidden );
		let eye;
		if ( hidden === 0 ) {

			eye = actionButton( 'visibility', 'Hide', () => void this._runAction( item, 'hide' ) );

		} else if ( hidden === objectIds.length ) {

			row.addClass( 'is-hidden' );
			eye = actionButton( 'visibility_off', 'Show', () => void this._runAction( item, 'show' ) );

		} else {

			row.addClass( 'is-partially-hidden' );
			eye = actionButton( 'visibility', `Show all (${ hidden } of ${ objectIds.length } hidden)`, () => void this._runAction( item, 'show' ) );

		}

		eye.addClass( 'SpatialTree-eye' );
		const actions = actionsRow(
			actionButton( 'filter_center_focus', 'Isolate', () => void this._runAction( item, 'isolate' ) ),
			eye,
		);
		if ( chevron ) row.dom.insertBefore( actions.dom, chevron );
		else row.add( actions );

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
