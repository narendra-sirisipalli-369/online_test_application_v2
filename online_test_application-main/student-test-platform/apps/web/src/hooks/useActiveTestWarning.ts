import { useEffect, useState } from 'react';
import { useBeforeUnload } from 'react-router-dom';

const WARNING_MESSAGE = 'Stay in the test. If you leave this page or switch tabs, your timer will keep running.';

export function useActiveTestWarning(active: boolean) {
  const [showTabWarning, setShowTabWarning] = useState(false);

  useBeforeUnload((event) => {
    if (!active) return;
    event.preventDefault();
    event.returnValue = WARNING_MESSAGE;
  });

  useEffect(() => {
    if (!active) {
      setShowTabWarning(false);
      return;
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') return;
      setShowTabWarning(true);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [active]);

  return {
    showTabWarning,
    dismissTabWarning: () => setShowTabWarning(false),
    warningMessage: WARNING_MESSAGE,
  };
}
