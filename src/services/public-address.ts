import { BlockList, isIP } from 'node:net';

export function publicIPv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  // Azure platform endpoint is publicly numbered but local to the VM platform.
  if (address === '168.63.129.16') return false;
  const [a = 0, b = 0, c = 0] = address.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const specialV6 = new BlockList();
for (const [address, prefix] of [
  ['2001::', 23], // Conservative exclusion of IETF special-purpose space.
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const)
  specialV6.addSubnet(address, prefix, 'ipv6');

/** Fail closed: ordinary global unicast only, no mapped/NAT64/tunnel addresses. */
export function publicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return publicIPv4(address);
  return (
    family === 6 &&
    !address.includes('%') &&
    globalV6.check(address, 'ipv6') &&
    !specialV6.check(address, 'ipv6')
  );
}
