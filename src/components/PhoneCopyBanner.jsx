import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../lib/AppContext';
import { phoneCopyBannerText, READ_ONLY_MESSAGE } from '../lib/phoneCopy';
import { useToast } from './Toast';
import './PhoneSync.css';

export const RECEIVE_FROM_MAC_PATH = '/app/import#receive-from-mac';

/** Slim banner for the read-only phone copy, plus the gentle message when an edit is refused. */
export default function PhoneCopyBanner() {
  const { phoneCopy, readOnlyNotice } = useAppContext();
  const toast = useToast();

  useEffect(() => {
    if (readOnlyNotice > 0) toast.info(READ_ONLY_MESSAGE);
    // Only a new refused edit should show the message again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnlyNotice]);

  if (!phoneCopy) return null;
  return (
    <div className="phone-copy-banner" role="status">
      <span>{phoneCopyBannerText(phoneCopy)}</span>
      <Link to={RECEIVE_FROM_MAC_PATH}>Receive from Mac again</Link>
    </div>
  );
}
