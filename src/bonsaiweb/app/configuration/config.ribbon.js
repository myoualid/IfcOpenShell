/**
 * Work modes swap the ribbon. A button with `workMode` is shown only in that
 * mode. Buttons without `workMode` stay visible in every mode.
 * `args` are passed to ops.execute after the operator name.
 */

export const defaultWorkMode = 'Project';

export const workModes = [
	{ id: 'Project', name: 'Project' },
	{ id: 'Navigate', name: 'Navigate' },
	{ id: 'Viewer', name: 'Viewer' },
	{ id: 'Hack', name: 'Hack' },
];

const button = ( id, name, icon, workMode, operator, args ) => ( {
	id,
	name,
	type: 'Button',
	icon,
	workMode,
	operator,
	args,
} );

export const ribbonButtons = [
	{ id: 'RB_Panels', name: 'Panels', type: 'Button', icon: 'view_sidebar' },

	button( 'RB_NewProject', 'New Project', 'note_add', 'Project', 'project.new' ),
	button( 'RB_LoadIfc', 'Add model', 'add', 'Project', 'project.open_file' ),
	button( 'RB_ClearAll', 'Clear all', 'clear', 'Project', 'project.clear' ),
	button( 'RB_LoadSample', 'Load sample', 'draft', 'Project', 'load.sample.ifc' ),

	button( 'RB_ViewFront', 'Front', 'filter_center_focus', 'Navigate', 'viewer.standard_view', [ 'FRONT' ] ),
	button( 'RB_ViewBack', 'Back', 'flip_to_back', 'Navigate', 'viewer.standard_view', [ 'BACK' ] ),
	button( 'RB_ViewLeft', 'Left', 'chevron_left', 'Navigate', 'viewer.standard_view', [ 'LEFT' ] ),
	button( 'RB_ViewRight', 'Right', 'chevron_right', 'Navigate', 'viewer.standard_view', [ 'RIGHT' ] ),
	button( 'RB_ViewTop', 'Top', 'vertical_align_top', 'Navigate', 'viewer.standard_view', [ 'TOP' ] ),
	button( 'RB_ViewBottom', 'Bottom', 'vertical_align_bottom', 'Navigate', 'viewer.standard_view', [ 'BOTTOM' ] ),
	button( 'RB_ViewAll', 'View all', 'zoom_out_map', 'Navigate', 'viewer.view_all' ),
	button( 'RB_FrameSelection', 'Frame', 'center_focus_strong', 'Navigate', 'viewer.frame_selection' ),
	button( 'RB_NavBlender', 'Blender', 'mouse', 'Navigate', 'viewer.nav_preset', [ 'blender' ] ),
	button( 'RB_NavRhino', 'Rhino', 'mouse', 'Navigate', 'viewer.nav_preset', [ 'rhino' ] ),
	button( 'RB_NavRevit', 'Revit', 'mouse', 'Navigate', 'viewer.nav_preset', [ 'revit' ] ),
	button( 'RB_NavWeb', 'Web', 'mouse', 'Navigate', 'viewer.nav_preset', [ 'web' ] ),

	button( 'RB_HideSelection', 'Hide', 'visibility_off', 'Viewer', 'hide.selection' ),
	button( 'RB_ShowSelection', 'Show', 'visibility', 'Viewer', 'show.selection' ),
	button( 'RB_ShowAll', 'Show all', 'visibility', 'Viewer', 'show.all' ),
	button( 'RB_HideAll', 'Hide all', 'visibility_off', 'Viewer', 'viewer.hide_all' ),
	button( 'RB_Isolate', 'Isolate', 'filter_center_focus', 'Viewer', 'viewer.isolate' ),
	button( 'RB_Xray', 'X-ray', 'blur_on', 'Viewer', 'viewer.xray' ),
	button( 'RB_ClearColors', 'Clear colors', 'format_color_reset', 'Viewer', 'viewer.clear_colors' ),
	button( 'RB_SelectionOutline', 'Outline', 'highlight', 'Viewer', 'viewer.selection_outline' ),
	button( 'RB_ClearSelection', 'Clear selection', 'deselect', 'Viewer', 'viewer.clear_selection' ),

	button( 'RB_ShowTerminal', 'Show terminal', 'terminal', 'Hack', 'code.show_terminal' ),
	button( 'RB_TerminalNew', 'New session', 'add', 'Hack', 'terminal.new' ),
	button( 'RB_TerminalClear', 'Clear', 'delete', 'Hack', 'code.terminal.clear' ),
];
