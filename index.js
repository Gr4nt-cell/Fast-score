import { registerRootComponent } from 'expo';
// the background task has to be defined before the app starts
import './src/background';
import App from './App';

registerRootComponent(App);
