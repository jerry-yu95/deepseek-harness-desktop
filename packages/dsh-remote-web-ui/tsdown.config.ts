import { clientBundle, mobileBundle } from '../../shared/tsdown.client.ts'

export default clientBundle('@linxin666/dsh-remote-web-ui', ['src/index.ts', 'src/invariant.ts'], {
  companions: [mobileBundle('@linxin666/dsh-remote-web-ui', 'src/mobile/index.tsx')],
})
