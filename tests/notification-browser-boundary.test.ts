import {afterEach,expect,it,vi} from 'vitest';
import {buildHtmlEmail,dispatchNotification,getGatewayStatus} from '../src/domain/notification';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('never activates provider delivery through browser environment variables',async()=>{vi.stubEnv('VITE_RESEND_API_KEY','synthetic-do-not-send');vi.stubEnv('VITE_FAST2SMS_API_KEY','synthetic-do-not-send');const network=vi.fn();vi.stubGlobal('fetch',network);expect(getGatewayStatus().emailConfigured).toBe(false);const r=await dispatchNotification({kind:'INFO',subject:'Synthetic',body:'Synthetic boundary test',channel:['email','sms']});expect(r.attempts.every(a=>a.status==='simulated')).toBe(true);expect(network).not.toHaveBeenCalled();});
it('escapes document-derived text in the email preview',()=>{expect(buildHtmlEmail('<img onerror=alert(1)>','<script>x</script>','INFO')).not.toContain('<script>');expect(buildHtmlEmail('<b>','x','INFO')).toContain('&lt;b&gt;');});
