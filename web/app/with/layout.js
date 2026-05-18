import WithShell from '../../components/with/WithShell';

export const metadata = {
  title: 'SUB/WAVE — Listen With',
  description:
    'Tune in to SUB/WAVE from any internet-radio player — VLC on desktop and mobile, cliamp in the terminal, or anything that opens an MP3 stream.',
};

export default function WithLayout({ children }) {
  return <WithShell>{children}</WithShell>;
}
