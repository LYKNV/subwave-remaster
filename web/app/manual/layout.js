import ManualShell from '../../components/manual/ManualShell';

export const metadata = {
  title: 'SUB/WAVE — Manual',
  description:
    'How to use SUB/WAVE — tuning in, making requests, how the AI DJ works, and running the station from the admin console.',
};

export default function ManualLayout({ children }) {
  return <ManualShell>{children}</ManualShell>;
}
