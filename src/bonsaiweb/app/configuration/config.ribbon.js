/**
 * Work modes swap the ribbon. A group or control with `workMode` is shown
 * only in that mode. Entries without `workMode` stay visible in every mode.
 * `args` are passed to ops.execute after the operator name.
 * `type: "RibbonGroup"` is a category. Its `name` is the label under the
 * controls in `children`.
 * `type: "Search"` is a text field. Enter runs `operator` with the trimmed text.
 * `type: "Checkbox"` is a labeled on/off field. A change runs `operator` with
 * the checked boolean.
 */

export const defaultWorkMode = 'Project';

export const workModes = [
	{ id: 'Project', name: 'Project' },
	{ id: 'Georeferencing', name: 'Georeferencing' },
	{ id: 'Navigate', name: 'Navigate' },
	{ id: 'View', name: 'View' },
	{ id: 'Panels', name: 'Panels' },
];

const button = ( id, name, icon, operator, args ) => ( {
	id,
	name,
	type: 'Button',
	icon,
	operator,
	args,
} );

const group = ( id, name, workMode, children ) => ( {
	id,
	name,
	type: 'RibbonGroup',
	workMode,
	children,
} );

const checkbox = ( id, name, operator ) => ( {
	id,
	name,
	type: 'Checkbox',
	operator,
} );

const search = ( id, placeholder, operator ) => ( {
	id,
	type: 'Search',
	placeholder,
	operator,
} );

export const ribbonButtons = [
	group( 'RG_Workspace', 'Workspace', 'Panels', [
		{ id: 'RB_Panels', name: 'Panels', type: 'Button', icon: 'view_sidebar' },
		button( 'RB_Profiler', 'Profiler', 'speed', 'profiler.toggle' ),
	] ),

	group( 'RG_Georeferencing', 'Survey', 'Georeferencing', [
		button( 'RB_SurveyPoint', 'Survey point', 'my_location', 'georeferencing.toggle' ),
	] ),

	group( 'RG_Project', 'Set up', 'Project', [
		button( 'RB_NewProject', 'New model', 'note_add', 'project.new' ),
		button( 'RB_LoadSample', 'Load sample', 'draft', 'load.sample.ifc' ),
	] ),
	group( 'RG_ProjectActions', 'Project', 'Project', [
		button( 'RB_LoadIfc', 'Open', 'folder_open', 'project.open_file' ),
		button( 'RB_SaveProject', 'Save', 'download', 'project.download' ),
		button( 'RB_ClearAll', 'Clear', 'clear', 'project.clear' ),
	] ),
	group( 'RG_Settings', 'Settings', 'Project', [
		button( 'RB_Settings', 'Settings', 'settings', 'settings.toggle' ),
	] ),
	group( 'RG_Views', 'Views', 'Navigate', [
		button( 'RB_ViewFront', 'Front', 'filter_center_focus', 'viewer.standard_view', [ 'FRONT' ] ),
		button( 'RB_ViewBack', 'Back', 'flip_to_back', 'viewer.standard_view', [ 'BACK' ] ),
		button( 'RB_ViewLeft', 'Left', 'chevron_left', 'viewer.standard_view', [ 'LEFT' ] ),
		button( 'RB_ViewRight', 'Right', 'chevron_right', 'viewer.standard_view', [ 'RIGHT' ] ),
		button( 'RB_ViewTop', 'Top', 'vertical_align_top', 'viewer.standard_view', [ 'TOP' ] ),
		button( 'RB_ViewBottom', 'Bottom', 'vertical_align_bottom', 'viewer.standard_view', [ 'BOTTOM' ] ),
	] ),

	group( 'RG_Camera', 'Camera', 'Navigate', [
		button( 'RB_ViewAll', 'View all', 'zoom_out_map', 'viewer.view_all' ),
		button( 'RB_FrameSelection', 'Focus', 'center_focus_strong', 'viewer.frame_selection' ),
		button( 'RB_Ortho', 'Ortho', 'crop_square', 'viewer.projection' ),
		button( 'RB_Fly', 'Fly', 'videocam', 'viewer.fly' ),
	] ),

	group( 'RG_Controls', 'Controls', 'Navigate', [
		{
			id: 'RB_NavPreset',
			type: 'Dropdown',
			operator: 'viewer.nav_preset',
			value: 'blender',
			options: [
				{ value: 'blender', name: 'Blender' },
				{ value: 'rhino', name: 'Rhino' },
				{ value: 'revit', name: 'Revit' },
				{ value: 'web', name: 'Web' },
			],
		},
	] ),
	group( 'RG_Viewport', 'Viewport', 'View', [
		checkbox( 'RB_Grid', 'Grid', 'viewer.grid' ),
		checkbox( 'RB_Axes', 'Axes', 'viewer.axes' ),
		checkbox( 'RB_Fog', 'Fog', 'viewer.fog_toggle' ),
	] ),
	group( 'RG_Display', 'Display', 'View', [
		button( 'RB_Xray', 'X-ray', 'blur_on', 'viewer.xray' ),
		button( 'RB_ClearColors', 'Clear colors', 'format_color_reset', 'viewer.clear_colors' ),
		checkbox( 'RB_SelectionOutline', 'Outline', 'viewer.selection_outline' ),
	] ),
	group( 'RG_Section', 'Section', 'View', [
		button( 'RB_Section', 'Section', 'content_cut', 'viewer.section' ),
		button( 'RB_ClearSection', 'Clear', 'delete_sweep', 'viewer.clear_section' ),
	] ),
	group( 'RG_Measure', 'Measure', 'View', [
		button( 'RB_MeasureLength', 'Length', 'straighten', 'viewer.measure', [ 'length' ] ),
		button( 'RB_MeasureArea', 'Area', 'square_foot', 'viewer.measure', [ 'area' ] ),
		button( 'RB_MeasureVolume', 'Volume', 'view_in_ar', 'viewer.measure', [ 'volume' ] ),
		button( 'RB_MeasureUndo', 'Undo point', 'undo', 'viewer.measure_undo' ),
		button( 'RB_MeasureClear', 'Clear', 'close', 'viewer.measure_clear' ),
	] ),
	group( 'RG_Visibility', 'Objects', 'View', [
		button( 'RB_HideSelection', 'Hide', 'visibility_off', 'hide.selection' ),
		button( 'RB_ShowSelection', 'Show', 'visibility', 'show.selection' ),
		button( 'RB_ShowAll', 'Show all', 'visibility', 'show.all' ),
		button( 'RB_HideAll', 'Hide all', 'visibility_off', 'viewer.hide_all' ),
		button( 'RB_Isolate', 'Isolate', 'filter_center_focus', 'viewer.isolate' ),
		button( 'RB_ClearSelection', 'Clear selection', 'deselect', 'viewer.clear_selection' ),
		search( 'RB_SelectGlobalId', 'GlobalId', 'viewer.select_global_id' ),
	] ),
];
