import { useState } from 'react';
import { segmentsSms } from '@prospeo/core';
import type { MessageView } from '../domain/prospect.js';
import type { TranslationKey } from '../i18n/translate.js';
import { useT } from './preferences.js';
import { jour } from './SiteSection.js';
import styles from './ProspectPanel.module.css';

const CLE_CANAL: Record<string, TranslationKey> = {
  email: 'messages.channel.email',
  sms: 'messages.channel.sms',
  appel: 'messages.channel.appel',
};

/**
 * Copie un texte, avec un repli qui ne ment pas.
 *
 * `navigator.clipboard` n'existe pas partout — hors contexte sécurisé, et dans
 * jsdom. Un bouton qui échoue en silence est pire qu'un bouton absent : on
 * croit avoir copié, on colle le message précédent, et il part au nom d'une
 * autre entreprise. On dit donc que la copie a échoué.
 */
async function copier(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    return false;
  }
}

function Message({ message }: { message: MessageView }) {
  const t = useT();
  const [etat, setEtat] = useState<'repos' | 'copie' | 'echec'>('repos');

  // Le décompte n'est affiché que pour le SMS, seul canal où la longueur est
  // une contrainte du support et non un choix de style.
  const mesure = message.channel === 'sms' ? segmentsSms(message.content) : null;

  return (
    <article className={styles.message}>
      <header className={styles.messageHeader}>
        <h4 className={styles.messageTitle}>
          {t(CLE_CANAL[message.channel] ?? 'messages.channel.appel')}
        </h4>
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            void copier(
              // L'objet part avec le corps : un email copié sans son objet
              // oblige à revenir le chercher, et c'est le moment où l'on colle
              // celui du prospect précédent.
              message.subject === null
                ? message.content
                : `${message.subject}\n\n${message.content}`,
            ).then((ok) => setEtat(ok ? 'copie' : 'echec'));
          }}
        >
          {etat === 'copie' ? t('messages.copied') : t('messages.copy')}
        </button>
      </header>

      {message.subject !== null ? (
        <p className={styles.messageSubject}>
          <span className={styles.fieldLabel}>{t('messages.subject')}</span> {message.subject}
        </p>
      ) : null}

      {/* `pre` : les messages portent des sauts de ligne signifiants — les
          paragraphes de l'email, et la ligne isolée qui porte l'URL. Les
          replier en un bloc ferait relire autre chose que ce qui sera envoyé. */}
      <pre className={styles.messageBody}>{message.content}</pre>

      {mesure !== null ? (
        <p className={styles.trace}>
          {t('messages.sms.measure', { chars: mesure.caracteres, segments: mesure.segments })}
          {mesure.horsGsm7.length > 0 ? (
            <>
              {' '}
              {t('messages.sms.ucs2', { chars: mesure.horsGsm7.join(' ') })}
            </>
          ) : null}
        </p>
      ) : null}

      <p className={styles.trace}>
        {t('messages.trace', {
          model: message.model,
          version: message.promptVersion,
          date: jour(message.createdAt),
        })}
      </p>

      {etat === 'echec' ? (
        <p className={styles.error} role="alert">
          {t('messages.copyFailed')}
        </p>
      ) : null}
    </article>
  );
}

/**
 * Les messages de vente, prêts à être relus puis copiés.
 *
 * **Rien ne part d'ici.** Le §10 du spec du socle le pose et D6 le confirme :
 * le texte est éditable, puis copié manuellement. Cet écran n'envoie rien, et
 * ne peut rien envoyer — il n'a ni serveur de messagerie ni passerelle SMS.
 */
export function MessagesSection({ messages }: { messages: MessageView[] }) {
  const t = useT();

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t('panel.section.messages')}</h3>
      {messages.length === 0 ? (
        <p className={styles.absent}>{t('messages.absent')}</p>
      ) : (
        <>
          <p className={styles.hint}>{t('messages.manual')}</p>
          {messages.map((m) => (
            <Message key={`${m.channel}-${m.createdAt}`} message={m} />
          ))}
        </>
      )}
    </section>
  );
}
