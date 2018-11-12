import { expect } from 'chai';

import { getChanges } from '../src/parser';

function testGetChanges(message: string, expected: Map<string, number> | [string, number][]) {
    return () => {
        if (!(expected instanceof Map)) {
            expected = new Map(expected);
        }

        const actual = getChanges(message);

        expect(actual.size).to.equal(expected.size, 'Number of changes not equal.');
        expect(actual).to.deep.equal(expected, 'Actual changes were not as expected.');
    };
}

describe('getChanges', () => {

    // match a generic user
    it('can handle user mentions',
        testGetChanges(
            '<@USOMEUSER>++',
            [
                ['<@USOMEUSER>', 1]
            ]
        )
    );

    // match a phrase wrapped in `
    it('can handle phrases in backtick wrappers',
        testGetChanges(
            '`some thing`++',
            [
                ['`some thing`', 1]
            ]
        )
    );

    // match an emoji :some-emoji:
    it('can handle emoji',
        testGetChanges(
            ':my-emoji:++',
            [
                [':my-emoji:', 1]
            ]
        )
    );
});