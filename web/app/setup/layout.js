import SetupShell from '../../components/setup/SetupShell';

export const metadata = {
  title: 'SUB/WAVE — Setup',
  description:
    'Run your own SUB/WAVE — connect it to your Navidrome library and an LLM provider (Ollama by default) in about ten minutes.',
};

export default function SetupLayout({ children }) {
  return <SetupShell>{children}</SetupShell>;
}
