import type { ReactNode } from 'react';
import { Box, Text } from 'ink';
import { c, glyph } from '../theme.js';

interface WindowFrameProps {
  title: string;
  children?: ReactNode;
  marginTop?: number;
  grow?: boolean;
}

// A faux Winamp 2.x window: a double-line frame topped with a beveled
// titlebar that has shimmer chars on the left, the panel title in amber,
// and tiny `_ □ ✕` window-button glyphs on the right.
//
// The titlebar is drawn as a regular Text row above an Ink Box with
// `borderStyle="double"` — Ink doesn't let us style the top border itself,
// so we render the bar separately and rely on the double border below to
// finish the window look.
export default function WindowFrame({ title, children, marginTop = 0, grow = false }: WindowFrameProps) {
  return (
    <Box
      flexDirection="column"
      marginTop={marginTop}
      flexGrow={grow ? 1 : 0}
      flexShrink={0}
    >
      <Box paddingX={1}>
        <Text>
          <Text color={c.lcdDim}>{glyph.shimL} </Text>
          <Text bold color={c.title}>{title}</Text>
          <Text color={c.lcdDim}> {glyph.shimR}</Text>
        </Text>
      </Box>
      <Box
        borderStyle="double"
        borderColor={c.chrome}
        flexDirection="column"
        paddingX={1}
        flexGrow={grow ? 1 : 0}
      >
        {children}
      </Box>
    </Box>
  );
}
