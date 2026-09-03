import { KeepAlive } from '@umijs/max';
import type { ComponentType } from 'react';

export default function WithKeepAlive<P extends object>(
  Component: ComponentType<P>,
  config: Record<string, unknown> = {},
) {
  return function KeepAlivePage(props: P) {
    return (
      <KeepAlive {...config}>
        <Component {...props} />
      </KeepAlive>
    );
  };
}
