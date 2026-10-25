import {useState} from 'react';
import {PersonStanding} from 'lucide-react';
import {applyDisplayPreferences,displayPreferences,type DisplayPreferences} from './DisplayPreferences';
import {makeT,useUiLang} from './i18n';
const sizes:[number,string,string][]=[[1,'100%','100%'],[1.1,'110%','110%'],[1.2,'120%','120%']];
export function AccessibilityMenu(){
  const t=makeT(useUiLang());
  const [value,setValue]=useState(displayPreferences);
  function save(next:DisplayPreferences){
    setValue(next);
    localStorage.setItem('workspace-display-v1',JSON.stringify(next));
    applyDisplayPreferences();
    window.dispatchEvent(new Event('workspace-display-change'));
  }
  return <details className="a11y-pop">
    <summary className="icon-button" aria-label={t('Display and language settings','डिस्प्ले और भाषा सेटिंग')} title={t('Text size, contrast, and language','टेक्स्ट आकार, कंट्रास्ट, और भाषा')}><PersonStanding size={17}/></summary>
    <div className="a11y-panel" role="group">
      <div className="a11y-row"><strong>{t('Text size','टेक्स्ट आकार')}</strong><div className="a11y-segment">{sizes.map(([scale,en,hi])=><button key={scale} type="button" aria-pressed={value.scale===scale} onClick={()=>save({...value,scale})}>{t(en,hi)}</button>)}</div></div>
      <div className="a11y-row"><strong>{t('High contrast','अधिक कंट्रास्ट')}</strong><div className="a11y-segment"><button type="button" aria-pressed={!value.contrast} onClick={()=>save({...value,contrast:false})}>{t('Off','बंद')}</button><button type="button" aria-pressed={value.contrast} onClick={()=>save({...value,contrast:true})}>{t('On','चालू')}</button></div></div>
      <div className="a11y-row"><strong>{t('Language','भाषा')}</strong><div className="a11y-segment"><button type="button" aria-pressed={value.locale==='en-IN'} onClick={()=>save({...value,locale:'en-IN'})}>EN</button><button type="button" aria-pressed={value.locale==='hi-IN'} onClick={()=>save({...value,locale:'hi-IN'})}>{t('हिन्दी','हिन्दी')}</button></div></div>
      <small>{t('Preferences stay on this device.','ये प्राथमिकताएँ इसी डिवाइस पर रहती हैं.')}</small>
    </div>
  </details>;
}
