import { BonsaiWebConfiguration } from './configuration/config.js';
import { installImports } from './configuration/imports.js';

installImports( BonsaiWebConfiguration.paths );

const BonsaiWeb = await import( '../build/bonsai-headless.js' );
window.bonsai = await BonsaiWeb.start( document.body, BonsaiWebConfiguration );
