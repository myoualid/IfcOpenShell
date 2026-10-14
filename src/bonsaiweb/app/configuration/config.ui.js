import { ribbonButtons } from "./config.ribbon.js";

export const WorldComponent = {
	id: "World",
	name: "World",
	type: "World",
	style: {
		position: "absolute",
		top: "0px",
		left: "0px",
		width: "100vw",
		height: "100vh",
	},
	children: [
		{
			id: "RibbonMenu",
			name: "Ribbon Menu",
			type: "Workspace",
			children: [
				{
					id: "HeaderBar",
					name: "Header Bar",
					type: "Workspace",
					children: [
						{
							id: "Logo",
							type: "Image",
							url: "./files/images/BonsaiWeb.svg",
						},
						{
							id: "WorkModeBar",
							name: "Work Modes",
							type: "Row",
							children: [],
						},
						{
							id: "HeaderMenu",
							name: "Header Menu",
							type: "Row",
							children: [
								{ id: "LayoutToggleBar", name: "Layout Toggle Bar", type: "Row", children: [] },
							],
						},
					],
				},
				{
					id: "RibbonBar",
					name: "Ribbon Bar",
					type: "RibbonBar",
					children: ribbonButtons,
				},
			],
		},
		{ id: "WorkspaceBottom", name: "Bottom Workspace", type: "Workspace" },
		{ id: "WorkspaceLeft", name: "Side Workspace Left", type: "Workspace" },
		{ id: "WorkspaceRight", name: "Side Workspace Right", type: "Workspace" },
		{
			id: "Viewport",
			name: "Viewport",
			type: "Workspace",
			children: [
				{ id: "Windows", name: "Windows Center", type: "WindowManager", children: [] },
			],
		},
		{ id: "Footer", name: "Footer Bar", type: "Workspace", children: [] },
	],
};

export const layoutConfig = {
	leftOpen: true,
	rightOpen: true,
	bottomOpen: true,
	topWorkspaceHeight: 86,
	leftWorkspaceWidth: 320,
	rightWorkspaceWidth: 340,
	bottomWorkspaceHeight: 260,
	minPanelSize: 160,
};
