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
		button( 'RB_Profiler', 'Profiler', 'speed', 'Profiler.Toggle' ),
	] ),

	group( 'RG_Georeferencing', 'Survey', 'Georeferencing', [
		button( 'RB_SurveyPoint', 'Survey point', 'my_location', 'Georeferencing.Toggle' ),
	] ),

	group( 'RG_Project', 'Set up', 'Project', [
		button( 'RB_NewProject', 'New model', 'note_add', 'Project.New' ),
		button( 'RB_LoadSample', 'Load sample', 'draft', 'Project.LoadSample' ),
	] ),
	group( 'RG_ProjectActions', 'Project', 'Project', [
		button( 'RB_LoadIfc', 'Open', 'folder_open', 'Project.OpenFile' ),
		button( 'RB_SaveProject', 'Save', 'download', 'Project.Download' ),
		button( 'RB_ClearAll', 'Clear', 'clear', 'Project.Clear' ),
	] ),
	group( 'RG_Settings', 'Settings', 'Project', [
		button( 'RB_Dropbox', 'Dropbox', 'cloud', 'Dropbox.Toggle' ),
		button( 'RB_Settings', 'Settings', 'settings', 'Settings.Toggle' ),
	] ),
	group( 'RG_Views', 'Views', 'Navigate', [
		button( 'RB_ViewFront', 'Front', 'filter_center_focus', 'Viewer.SetStandardView', [ 'FRONT' ] ),
		button( 'RB_ViewBack', 'Back', 'flip_to_back', 'Viewer.SetStandardView', [ 'BACK' ] ),
		button( 'RB_ViewLeft', 'Left', 'chevron_left', 'Viewer.SetStandardView', [ 'LEFT' ] ),
		button( 'RB_ViewRight', 'Right', 'chevron_right', 'Viewer.SetStandardView', [ 'RIGHT' ] ),
		button( 'RB_ViewTop', 'Top', 'vertical_align_top', 'Viewer.SetStandardView', [ 'TOP' ] ),
		button( 'RB_ViewBottom', 'Bottom', 'vertical_align_bottom', 'Viewer.SetStandardView', [ 'BOTTOM' ] ),
	] ),

	group( 'RG_Camera', 'Camera', 'Navigate', [
		button( 'RB_ViewAll', 'View all', 'zoom_out_map', 'Viewer.ViewAll' ),
		button( 'RB_FrameSelection', 'Focus', 'center_focus_strong', 'Viewer.FrameSelection' ),
		button( 'RB_Ortho', 'Ortho', 'crop_square', 'Viewer.ToggleProjection' ),
		button( 'RB_Fly', 'Fly', 'videocam', 'Viewer.ToggleFly' ),
	] ),

	group( 'RG_Controls', 'Controls', 'Navigate', [
		{
			id: 'RB_NavPreset',
			type: 'Dropdown',
			operator: 'Viewer.SetNavPreset',
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
		checkbox( 'RB_Grid', 'Grid', 'Viewer.ToggleGrid' ),
		checkbox( 'RB_Axes', 'Axes', 'Viewer.ToggleAxes' ),
		checkbox( 'RB_Fog', 'Fog', 'Scene.ToggleFog' ),
	] ),
	group( 'RG_Display', 'Display', 'View', [
		button( 'RB_Xray', 'X-ray', 'blur_on', 'Viewer.ToggleXray' ),
		button( 'RB_ClearColors', 'Clear colors', 'format_color_reset', 'Viewer.ClearColors' ),
		checkbox( 'RB_SelectionOutline', 'Outline', 'Viewer.ToggleSelectionOutline' ),
	] ),
	group( 'RG_Section', 'Section', 'View', [
		button( 'RB_Section', 'Section', 'content_cut', 'Viewer.ToggleSection' ),
		button( 'RB_ClearSection', 'Clear', 'delete_sweep', 'Viewer.ClearSection' ),
	] ),
	group( 'RG_Measure', 'Measure', 'View', [
		button( 'RB_MeasureLength', 'Length', 'straighten', 'Viewer.Measure', [ 'length' ] ),
		button( 'RB_MeasureArea', 'Area', 'square_foot', 'Viewer.Measure', [ 'area' ] ),
		button( 'RB_MeasureVolume', 'Volume', 'view_in_ar', 'Viewer.Measure', [ 'volume' ] ),
		button( 'RB_MeasureUndo', 'Undo point', 'undo', 'Viewer.UndoMeasurePoint' ),
		button( 'RB_MeasureClear', 'Clear', 'close', 'Viewer.ClearMeasure' ),
	] ),
	group( 'RG_Visibility', 'Objects', 'View', [
		button( 'RB_HideSelection', 'Hide', 'visibility_off', 'Viewer.HideSelected' ),
		button( 'RB_ShowSelection', 'Show', 'visibility', 'Viewer.ShowSelected' ),
		button( 'RB_ShowAll', 'Show all', 'visibility', 'Viewer.ShowAll' ),
		button( 'RB_HideAll', 'Hide all', 'visibility_off', 'Viewer.HideAll' ),
		button( 'RB_Isolate', 'Isolate', 'filter_center_focus', 'Viewer.IsolateSelected' ),
		button( 'RB_ClearSelection', 'Clear selection', 'deselect', 'Viewer.ClearSelection' ),
		search( 'RB_SelectGlobalId', 'GlobalId', 'Viewer.SelectGlobalId' ),
	] ),
];
