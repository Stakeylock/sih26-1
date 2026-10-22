import {StrictMode,Component,type ErrorInfo,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import App from './App';
import './styles.css';
class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(_error:Error,_info:ErrorInfo){ /* Do not log session or case data. */ }
  render(){return this.state.failed?<main className="startup"><h1>Workspace unavailable</h1><p>Reload to recover your workspace. Unsaved form changes may need to be entered again.</p><button className="button" onClick={()=>location.reload()}>Reload workspace</button></main>:this.props.children;}
}
createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><App/></ErrorBoundary></StrictMode>);
