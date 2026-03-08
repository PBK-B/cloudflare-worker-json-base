import React from 'react';
import { ToastContainer } from './utils/notification';
import { AppRouterProvider } from './router';

const App: React.FC = () => {
	return (
		<>
			<ToastContainer />
			<AppRouterProvider />
		</>
	);
};

export default App;
