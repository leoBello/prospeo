import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Sans ce démontage, deux tests qui rendent le même composant laissent deux
 * copies dans le document : les requêtes `getByText` deviennent ambiguës et
 * échouent sur un « found multiple elements » qui n'a rien à voir avec la
 * règle testée.
 */
afterEach(cleanup);
