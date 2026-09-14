import { useEffect, useState } from "react";
import { getSavedSettings, saveSettings, subscribeToSettings } from "./settings";

// One settings object shared by every control on the page. A control
// that saves through saveSettings() fires the change event, and every
// other subscriber picks up the new object; the reference check keeps a
// component from re-saving an object it was just handed.
export const useSettings = () => {
  const [settings, setSettings] = useState(getSavedSettings);

  useEffect(
    () =>
      subscribeToSettings((next) =>
        setSettings((current) =>
          JSON.stringify(current) === JSON.stringify(next) ? current : next
        )
      ),
    []
  );

  const update = (patch) => {
    const next = saveSettings({ ...getSavedSettings(), ...patch });
    setSettings(next);
    return next;
  };

  return [settings, update];
};

