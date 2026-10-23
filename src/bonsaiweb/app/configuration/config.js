import { GeometryConfig } from './config.geometry.js';
import { CoreModules } from './config.modules.js';
import { defaultWorkMode, ribbonButtons, workModes } from './config.ribbon.js';
import { layoutConfig, WorldComponent } from './config.ui.js';

export const BonsaiWebConfiguration = {
	ui: {
		WorldComponent,
		layout: layoutConfig,
	},
	app: {
		Name: 'Bonsai Web',
		Version: '0.1.0',
		CoreModules,
	},
	geometry: GeometryConfig,
	ribbon: {
		workModes,
		defaultWorkMode,
		buttons: ribbonButtons,
	},
	dropbox: { clientId: 'idh1h4o0gs8nx2z' },
};
