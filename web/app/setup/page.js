import SetupPage from '../../components/setup/SetupPage';

export const metadata = {
  title: 'SUB/WAVE — Setup',
  description:
    'Run your own SUB/WAVE — connect it to your Navidrome library and an LLM provider (Ollama by default) in about ten minutes.',
};

export default function Setup() {
  return <SetupPage />;
}
