export function openModelFilePicker( onFile ) {

	const input = document.createElement( 'input' );
	input.type = 'file';
	input.accept = '.ifc,.ifcview,.zip,application/zip';
	input.style.display = 'none';

	const cleanup = () => {

		window.removeEventListener( 'focus', onWindowFocus );
		input.remove();

	};

	const onWindowFocus = () => {

		setTimeout( () => {

			if ( input.isConnected ) cleanup();

		}, 300 );

	};

	window.addEventListener( 'focus', onWindowFocus );

	input.addEventListener(
		'change',
		() => {

			const file = input.files?.[ 0 ] ?? null;
			cleanup();
			if ( file ) onFile( file );

		},
		{ once: true },
	);
	input.addEventListener( 'cancel', cleanup, { once: true } );

	document.body.appendChild( input );
	input.click();

}
