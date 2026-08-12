import { addressFromBytes32, normalizeEvmAddress } from './oft-contract.client';

describe('OftContractClient address helpers', () => {
  it('normalizes an EVM address', () => {
    expect(
      normalizeEvmAddress('0x000000000000000000000000000000000000000A'),
    ).toBe('0x000000000000000000000000000000000000000a');
  });

  it('extracts an EVM address from bytes32', () => {
    expect(
      addressFromBytes32(
        '0x000000000000000000000000000000000000000000000000000000000000000a',
      ),
    ).toBe('0x000000000000000000000000000000000000000a');
  });

  it('rejects malformed bytes32', () => {
    expect(addressFromBytes32('0x01')).toBeNull();
  });
});
