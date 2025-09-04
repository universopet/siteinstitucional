/**
 * Global Click-to-Buy (CTB) Handler
 * Manages CTB modals for product purchase flows with fallback support
 */
( function () {
	let ctbmodal;
	let urlToken;
	let refreshTokenTimeoutId = null;

	// -------------------------------------------------------------------------
	// Core CTB functionality
	// -------------------------------------------------------------------------

	/**
	 * Main handler for CTB clicks
	 * @param {Event} e - Click event
	 */
	const loadCtb = ( e ) => {
		// Find the actual CTB element
		const ctbElement = e.target.closest( '[data-ctb-id]' );
		const ctbId = ctbElement.getAttribute( 'data-ctb-id' );
		const destinationUrl = ctbElement.getAttribute( 'href' );
		// Disable element during loading
		ctbElement.setAttribute( 'disabled', 'true' );

		// Create and display modal
		const modal = openModal( e, ctbId );
		const modalWindow = modal.querySelector( '.global-ctb-modal-content' );
		const modalLoader = modal.querySelector( '.global-ctb-loader' );

		if ( urlToken && ctbId ) {
			ctbElement.removeAttribute( 'disabled' );
			// Show close button
			modalWindow.querySelector(
				'.global-ctb-modal-close'
			).style.display = 'flex';
			// Create and load iframe
			const locale = window.NewfoldRuntime?.sdk?.locale || 'en_US';

			try {
				// Check if the URL token is valid
				const url = new URL( urlToken );
				url.searchParams.set( 'id', ctbId );
				const iframeURL = url.toString();
				const iframe = document.createElement( 'iframe' );
				iframe.src = iframeURL + '&locale=' + locale;
				modalWindow.replaceChild( iframe, modalLoader );
			} catch ( error ) {
				// If invalid, log error and fallback to API
				console.error( 'Invalid URL token:', error );
				fetchTokenFromAPIFallback();
				return;
			}
			ctbClickEvent( e, ctbId );
		} else {
			// Fetch CTB iframe URL from API
			fetchTokenFromAPIFallback();
		}

		/**
		 * Fallback if token is not valid.
		 * Attempts to update token and display ctb modal
		 */
		function fetchTokenFromAPIFallback() {
			window
				.fetch(
					`${ window.NewfoldRuntime.restUrl }newfold-ctb/v2/ctb/${ ctbId }`,
					{
						credentials: 'same-origin',
						headers: {
							'Content-Type': 'application/json',
							'X-WP-Nonce': window.NewfoldRuntime.restNonce,
						},
					}
				)
				.then( ( response ) => {
					// Re-enable element
					ctbElement.removeAttribute( 'disabled' );

					if ( response.ok ) {
						return response.json();
					}
					throw Error( response.statusText );
				} )
				.then( ( data ) => {
					// Show close button
					modalWindow.querySelector(
						'.global-ctb-modal-close'
					).style.display = 'flex';

					// Create and load iframe
					const iframe = document.createElement( 'iframe' );
					const locale =
						window.NewfoldRuntime?.sdk?.locale || 'en_US';
					const iframeURL = data.url + '&locale=' + locale;
					iframe.src = iframeURL;
					modalWindow.replaceChild( iframe, modalLoader );
					setTokenCookie( 'nfd_global_ctb_url_token', iframeURL, 25 );
					// track click event
					ctbClickEvent( e, ctbId );
				} )
				.catch( ( error ) => {
					displayError( modalWindow, error, ctbElement );
					closeModal();
					// track click event
					ctbClickEvent( e, ctbId );
					// Remove CTB attributes from element
					if ( ctbElement ) {
						ctbElement.removeAttribute( 'data-ctb-id' );
						ctbElement.removeAttribute( 'data-action' );
					}

					// Fall back to opening destination URL
					window.open(
						destinationUrl,
						'_blank',
						'noopener noreferrer'
					);
				} );
		}
	};

	// -------------------------------------------------------------------------
	// Modal management
	// -------------------------------------------------------------------------

	/**
	 * Opens the CTB modal
	 * @param {Event}  e     - Click event
	 * @param {string} ctbId - CTB identifier
	 * @return {HTMLElement} - Modal container
	 */
	const openModal = ( e, ctbId ) => {
		const modalContent = `
			<div class="global-ctb-modal" style="z-index: 100001 !important;">
				<div class="global-ctb-modal-overlay" data-a11y-dialog-destroy></div>
				<div role="document" class="global-ctb-modal-content">
					<div class="global-ctb-modal-close" data-a11y-dialog-destroy style="display:none;">✕</div>
					<div class="global-ctb-loader"></div>
				</div>
			</div>
		`;

		// Create or reuse container
		let ctbContainer = document.getElementById(
			'nfd-global-ctb-container'
		);
		if ( ctbContainer ) {
			ctbContainer.innerHTML = modalContent;
		} else {
			ctbContainer = document.createElement( 'div' );
			ctbContainer.setAttribute( 'id', 'nfd-global-ctb-container' );
			ctbContainer.innerHTML = modalContent;
			document.body.appendChild( ctbContainer );
		}

		// Set container attributes and show modal
		ctbContainer.setAttribute( 'data-ctb-id', ctbId );
		ctbmodal = new A11yDialog( ctbContainer );
		ctbmodal.show();
		document.querySelector( 'body' ).classList.add( 'noscroll' );

		return ctbContainer;
	};

	/**
	 * Closes the CTB modal
	 */
	const closeModal = () => {
		if ( ctbmodal ) {
			ctbmodal.destroy();
			document.querySelector( 'body' ).classList.remove( 'noscroll' );
			const ctbContainer = document.getElementById(
				'nfd-global-ctb-container'
			);
			if ( ctbContainer ) {
				ctbContainer.innerHTML = '';
			}
		}
	};

	/**
	 * Displays error message in modal
	 * @param {HTMLElement}  modalWindow - Modal window element
	 * @param {string|Error} error       - Error message or object
	 * @param {HTMLElement}  ctbElement  - CTB element that was clicked
	 */
	const displayError = ( modalWindow, error, ctbElement ) => {
		const message =
			error === 'purchase'
				? 'complete the transaction'
				: 'load the product information';
		modalWindow.innerHTML = `<div style="text-align:center;">
			<h3>${ error }</h3>
			<p>Sorry, we are unable to ${ message } at this time.</p>
			<button class="components-button bluehost is-primary" data-a11y-dialog-destroy>Cancel</button>
		</div>`;

		// Remove attributes from clicked element
		if ( ctbElement ) {
			ctbElement.removeAttribute( 'data-ctb-id' );
			ctbElement.removeAttribute( 'data-action' );
		}
	};

	// -------------------------------------------------------------------------
	// Analytics and context detection
	// -------------------------------------------------------------------------

	/**
	 * Tracks CTB click events
	 * @param {Event}  e     - Click event
	 * @param {string} ctbId - CTB identifier
	 */
	const ctbClickEvent = ( e, ctbId ) => {
		window.wp
			.apiFetch( {
				url: window.nfdgctb.eventendpoint,
				method: 'POST',
				data: {
					action: 'ctb_modal_opened',
					data: {
						label_key: 'ctb_id',
						ctb_id: ctbId,
						brand: window.nfdgctb.brand,
						context: determineContext( e ),
						page: window.location.href,
					},
				},
			} )
			.catch( ( error ) => {
				console.error( 'Error sending event to API', error );
			} );
	};

	/**
	 * Determines the context of a CTB button
	 * @param {Event} e - Click event
	 * @return {string} - Context identifier
	 */
	const determineContext = ( e ) => {
		// Check for explicit context attribute
		const ctbElement = e.target.closest( '[data-ctb-id]' );
		if ( ctbElement && ctbElement.hasAttribute( 'data-ctb-context' ) ) {
			return ctbElement.getAttribute( 'data-ctb-context' );
		}

		// Check for context based on parent elements
		if ( e.target.closest( '.marketplace-item' ) ) {
			return 'marketplace-item';
		}

		if ( e.target.closest( '.newfold-notifications-wrapper' ) ) {
			return 'notification';
		}

		if ( e.target.closest( '.nfd-root' ) ) {
			return 'plugin-app';
		}

		// Default context
		return 'external';
	};

	// -------------------------------------------------------------------------
	// Utilities
	// -------------------------------------------------------------------------

	/**
	 * Checks if global CTB is supported
	 * @return {boolean} - Whether global CTB is supported
	 */
	const supportsGlobalCTB = () => {
		return (
			'NewfoldRuntime' in window &&
			'capabilities' in window.NewfoldRuntime &&
			'canAccessGlobalCTB' in window.NewfoldRuntime.capabilities &&
			window.NewfoldRuntime.capabilities.canAccessGlobalCTB === true
		);
	};

	// -------------------------------------------------------------------------
	// Event listeners
	// -------------------------------------------------------------------------

	/**
	 * Set up click event delegation for CTB elements
	 */
	document.addEventListener( 'click', function ( event ) {
		// Handle modal close button clicks
		if ( event.target.hasAttribute( 'data-a11y-dialog-destroy' ) ) {
			closeModal();
		} else {
			// Check if the clicked element is a CTB element
			const ctbElement = event.target.closest( '[data-ctb-id]' );
			if (
				ctbElement &&
				ctbElement.getAttribute( 'disabled' ) !== 'true'
			) {
				// Prevent default action and load CTB
				event.target.blur();
				if ( supportsGlobalCTB() ) {
					event.preventDefault();
					loadCtb( event );
				}
			}
		}
	} );

	/**
	 * Handle iframe resize and close messages
	 */
	window.addEventListener( 'message', function ( event ) {
		// Only process messages from trusted origins
		if ( ! event.origin.includes( 'hiive' ) ) {
			return;
		}

		const iframe = document.querySelector(
			'.global-ctb-modal-content iframe'
		);

		// Handle iframe width adjustments
		if ( event.data.type === 'frameWidth' && iframe ) {
			iframe.style.width = event.data.width;
			iframe.contentWindow.postMessage( { type: 'getFrameHeight' }, '*' );
		}

		// Handle iframe height adjustments
		if ( event.data.type === 'frameHeight' && iframe ) {
			iframe.style.height = event.data.height;
		}

		// Handle modal close requests
		if ( event.data === 'closeModal' ) {
			closeModal();
		}
	} );
	/**
	 * Adds an event listener to execute when the DOM content is fully loaded.
	 * If the global CTB (Click-to-Buy) functionality is supported, it schedules a token refresh.
	 */
	window.addEventListener( 'DOMContentLoaded', function () {
		if ( supportsGlobalCTB() ) {
			scheduleTokenRefresh( 'nfd_global_ctb_url_token' );
		}
	} );

	/**
	 * Handle token refresh messages
	 */
	window.addEventListener( 'message', function ( event ) {
		// Only process messages from trusted origins
		if ( ! event.origin.includes( 'hiive' ) ) {
			return;
		}
		if ( event.data.type === 'tokenRefresh' ) {
			const { accessToken, refreshToken } = event.data.data;
			if ( urlToken ) {
				const url = new URL( urlToken );
				url.searchParams.set( 'token', accessToken );
				url.searchParams.set( 'refreshToken', refreshToken );
				urlToken = url.toString();
				setTokenCookie( 'nfd_global_ctb_url_token', urlToken, 25 );
			}
		}
	} );

	/**
	 * Schedules a token refresh based on the expiration time stored in a cookie.
	 * If the token is missing, expired, or invalid, it fetches and sets a new token.
	 *
	 * @param {string} tokenName - The name of the cookie containing the token and its expiration timestamp.
	 */
	function scheduleTokenRefresh( tokenName ) {
		const cookieValue = getTokenCookie( tokenName );
		if ( ! cookieValue ) {
			// If no cookie, fetch and set the token
			fetchAndSetUrlToken();
			return;
		}

		const parts = cookieValue.split( '|' );
		if ( parts.length !== 2 ) {
			// If cookie format is invalid, fetch and set the token
			fetchAndSetUrlToken();
			return;
		}
		const expiryTimestamp = Number( parts[ 1 ] );
		const now = Date.now();
		const timeLeft = expiryTimestamp - now;
		if ( timeLeft <= 0 ) {
			// If the token is expired, fetch and set a new token
			fetchAndSetUrlToken();
		} else {
			urlToken = parts[ 0 ];
			window.nfdgctb.log = `Token is valid, scheduling refresh in ${ timeLeft }ms`;
			// If the token is valid, set a timeout to refresh it
			if ( refreshTokenTimeoutId ) {
				clearTimeout( refreshTokenTimeoutId );
			}
			refreshTokenTimeoutId = setTimeout( () => {
				fetchAndSetUrlToken();
			}, timeLeft );
		}
	}

	/**
	 * Fetches a new URL token from the server and sets it in a cookie.
	 * The token is used for CTB (Click-to-Buy) functionality.
	 *
	 * The function makes a `fetch` request to the server endpoint to retrieve the token.
	 * If the request is successful, the token is stored in a cookie with a specified token life.
	 */
	function fetchAndSetUrlToken() {
		window
			.fetch(
				`${ window.NewfoldRuntime.restUrl }newfold-ctb/v2/ctb/url`,
				{
					credentials: 'same-origin',
					headers: {
						'Content-Type': 'application/json',
						'X-WP-Nonce': window.NewfoldRuntime.restNonce,
					},
				}
			)
			.then( ( response ) => {
				if ( response.ok ) {
					return response.json();
				}
				throw new Error( response.statusText );
			} )
			.then( ( data ) => {
				urlToken = data.url;
				setTokenCookie( 'nfd_global_ctb_url_token', urlToken, 25 );
			} )
			.catch( ( error ) => {
				console.error( 'Error fetching token:', error );
			} );
	}
	/**
	 * Sets a cookie with a token and its expiration time, and schedules a token refresh.
	 *
	 * @param {string} name             - The name of the cookie to set.
	 * @param {string} token            - The token value to store in the cookie.
	 * @param {number} [lifeMinutes=25] - The lifespan of the cookie in minutes (default is 25 minutes).
	 */
	function setTokenCookie( name, token, lifeMinutes = 25 ) {
		const date = new Date();
		const life = lifeMinutes * 60 * 1000; // ms
		const setTime = date.getTime() + life;
		date.setTime( setTime );
		const expires = 'expires=' + date.toUTCString();
		const tokenWithExpiry = token + '|' + setTime;
		document.cookie = `${ name }=${ encodeURIComponent(
			tokenWithExpiry
		) }; ${ expires }; path=/; Secure; SameSite=Strict`;

		if ( refreshTokenTimeoutId ) {
			clearTimeout( refreshTokenTimeoutId );
		}
		refreshTokenTimeoutId = setTimeout( () => {
			fetchAndSetUrlToken();
		}, life );
	}
	/**
	 * Retrieves the value of a specific cookie.
	 *
	 * @param {string} name - The name of the cookie to retrieve.
	 * @return {string|null} - The decoded value of the cookie if it exists, or `null` if not found.
	 */
	function getTokenCookie( name ) {
		const nameEQ = name + '=';
		const cookies = document.cookie.split( ';' );
		for ( let cookie of cookies ) {
			cookie = cookie.trim();
			if ( cookie.startsWith( nameEQ ) ) {
				return decodeURIComponent( cookie.substring( nameEQ.length ) );
			}
		}
		return null;
	}
} )();
