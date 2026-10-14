import { Operator } from '../../ops/Operator.js';
import { Terminal } from '../../tool/index.js';
import { formatRunOutput, runUserCode } from '../code.scripting/core.js';

class CodeShowTerminal extends Operator {

	static operatorName = 'code.show_terminal';
	static operatorLabel = 'Show Terminal';

	constructor( context ) {

		super( context );

	}

	poll() {

		return Boolean( this.context.terminal?.terminalPanel );

	}

	execute() {

		this.context.terminal.terminalPanel.toggle();
		return { status: 'FINISHED' };

	}

}

class TerminalNew extends Operator {

	static operatorName = 'terminal.new';
	static operatorLabel = 'New Terminal';
	static undoable = true;

	constructor( context, name ) {

		super( context );
		this.name = name;

	}

	poll() {

		return Boolean( this.context.terminal );

	}

	execute() {

		if ( this.session ) Terminal.attach( this.session, this.index );
		else this.session = Terminal.create( this.name );
		this.context.terminal?.onTerminalCreated?.( this.session.guid );
		return { status: 'FINISHED', result: this.session };

	}

	undo() {

		const detached = Terminal.detach( this.session?.guid );
		if ( ! detached ) return;
		this.session = detached.session;
		this.index = detached.index;
		this.context.terminal?.onTerminalClosed?.( this.session.guid );

	}

}

class TerminalExecute extends Operator {

	static operatorName = 'code.terminal.execute';
	static operatorLabel = 'Execute Terminal Command';

	constructor( context, command, terminalGuid ) {

		super( context );
		this.command = command;
		this.terminalGuid = terminalGuid;

	}

	poll() {

		return Boolean( this.context.terminal && this.command );

	}

	async execute() {

		const guid = this.terminalGuid || this.context.terminal?.activeTerminalGuid;
		if ( ! Terminal.get( guid ) ) throw new Error( `No terminal found: ${ guid }` );

		const trimmed = String( this.command ?? '' ).trim();
		if ( ! trimmed ) return { status: 'CANCELLED', result: { success: false, output: '' } };

		const result = await runUserCode( this.context, trimmed, { asExpression: true } );
		const output = formatRunOutput( result );
		Terminal.append( guid, trimmed, output, result.success );
		this.context.terminal?.onCommandResult?.( {
			terminalGuid: guid,
			command: trimmed,
			output,
			success: result.success,
		} );

		return {
			status: result.success ? 'FINISHED' : 'ERROR',
			result: { success: result.success, output },
		};

	}

}

class TerminalClear extends Operator {

	static operatorName = 'code.terminal.clear';
	static operatorLabel = 'Clear Terminal';
	static undoable = true;

	constructor( context, terminalGuid ) {

		super( context );
		this.terminalGuid = terminalGuid;

	}

	poll() {

		const guid = this.terminalGuid || this.context.terminal?.activeTerminalGuid;
		return Boolean( this.context.terminal && guid && Terminal.get( guid ) );

	}

	execute() {

		const guid = this.terminalGuid || this.context.terminal?.activeTerminalGuid;
		const session = Terminal.get( guid );
		if ( ! session ) return { status: 'CANCELLED' };
		this.terminalGuid = guid;
		if ( ! this.previousHistory ) this.previousHistory = session.history.slice();
		Terminal.clear( guid );
		this.context.terminal?.onTerminalCleared?.( guid );
		return { status: 'FINISHED' };

	}

	undo() {

		const session = Terminal.get( this.terminalGuid );
		if ( ! session || ! this.previousHistory ) return;
		session.history = this.previousHistory.slice();
		this.context.terminal?.onTerminalCleared?.( this.terminalGuid );

	}

}

export {
	CodeShowTerminal,
	TerminalNew,
	TerminalExecute,
	TerminalClear,
};
export default [ CodeShowTerminal, TerminalNew, TerminalExecute, TerminalClear ];
