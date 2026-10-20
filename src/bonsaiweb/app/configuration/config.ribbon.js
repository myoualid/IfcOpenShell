/**
 * Work modes swap the ribbon. A group or control with `workMode` is shown
 * only in that mode. Entries without `workMode` stay visible in every mode.
 * `args` are passed to ops.execute after the operator name.
 * `type: "RibbonGroup"` is a category. Its `name` is the label under the
 * controls in `children`.
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

export const ribbonButtons = [
	group( 'RG_Workspace', 'Workspace', 'Panels', [
		{ id: 'RB_Panels', name: 'Panels', type: 'Button', icon: 'view_sidebar' },
		button( 'RB_Profiler', 'Profiler', 'speed', 'profiler.toggle' ),
	] ),

	group( 'RG_Georeferencing', 'Survey', 'Georeferencing', [
		button( 'RB_SurveyPoint', 'Survey point', 'my_location', 'georeferencing.toggle' ),
	] ),

	group( 'RG_Project', 'Project', 'Project', [
		button( 'RB_LoadIfc', 'Open model', 'add', 'project.open_file' ),
		button( 'RB_LoadSample', 'Load sample', 'draft', 'load.sample.ifc' ),
		button( 'RB_NewProject', 'New Project', 'note_add', 'project.new' ),
		button( 'RB_ClearAll', 'Clear all', 'clear', 'project.clear' ),
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

	group( 'RG_Visibility', 'Visibility', 'View', [
		button( 'RB_HideSelection', 'Hide', 'visibility_off', 'hide.selection' ),
		button( 'RB_ShowSelection', 'Show', 'visibility', 'show.selection' ),
		button( 'RB_ShowAll', 'Show all', 'visibility', 'show.all' ),
		button( 'RB_HideAll', 'Hide all', 'visibility_off', 'viewer.hide_all' ),
		button( 'RB_Isolate', 'Isolate', 'filter_center_focus', 'viewer.isolate' ),
	] ),

	group( 'RG_Display', 'Display', 'View', [
		button( 'RB_Xray', 'X-ray', 'blur_on', 'viewer.xray' ),
		button( 'RB_ClearColors', 'Clear colors', 'format_color_reset', 'viewer.clear_colors' ),
		button( 'RB_SelectionOutline', 'Outline', 'highlight', 'viewer.selection_outline' ),
		button( 'RB_ClearSelection', 'Clear selection', 'deselect', 'viewer.clear_selection' ),
	] ),
];
