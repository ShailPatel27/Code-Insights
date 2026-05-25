import * as assert from 'assert';
import { suite, test } from 'mocha';
import { resolveFunction } from '../detection/functionResolver';

suite('Function Resolver', () => {
	test('resolves three-part NumPy calls from aliases', () => {
		const code = [
			'import numpy as np',
			'arr = [1, 2, 3]',
			'np.random.shuffle(arr)'
		].join('\n');

		assert.deepStrictEqual(resolveFunction(code, 2), {
			key: 'np.random.shuffle'
		});
	});

	test('resolves two-part NumPy calls from aliases', () => {
		const code = [
			'import numpy as np',
			'arr = [3, 1, 2]',
			'ordered = np.sort(arr)'
		].join('\n');

		assert.deepStrictEqual(resolveFunction(code, 2), {
			key: 'np.sort'
		});
	});

	test('resolves direct NumPy imports', () => {
		const code = [
			'from numpy.random import shuffle',
			'arr = [1, 2, 3]',
			'shuffle(arr)'
		].join('\n');

		assert.deepStrictEqual(resolveFunction(code, 2), {
			key: 'np.random.shuffle'
		});
	});

	test('resolves supported Python built-ins', () => {
		const code = [
			'items = [3, 1, 2]',
			'ordered = sorted(items)'
		].join('\n');

		assert.deepStrictEqual(resolveFunction(code, 1), {
			key: 'python.sorted'
		});
	});

	test('resolves list methods from simple list assignments', () => {
		const code = [
			'items = [3, 1, 2]',
			'items.sort()'
		].join('\n');

		assert.deepStrictEqual(resolveFunction(code, 1), {
			key: 'list.sort'
		});
	});

	test('does not resolve non-NumPy aliases as NumPy', () => {
		const code = [
			'import pandas as pd',
			'pd.sort(values)'
		].join('\n');

		assert.strictEqual(resolveFunction(code, 1), null);
	});
});
