const mem = require('mem');

(async () => {
	let i = 0;
	const memoized = mem(async () => {
		i++;

		// if (i === 1) {
		// 	throw new Error('foo bar');
		// }

		return i;
	});

	try {
		console.log(await memoized());
	} catch (error) {
		
	}
	try {
		console.log(await memoized());
	} catch (error) {
		
	}
	try {
		console.log(await memoized());
	} catch (error) {
		
	}
})();


