import { Container } from '../components/Primitives.jsx';
import PageHero from '../components/PageHero.jsx';
import PathCard from '../components/PathCard.jsx';
import { colors } from '../theme/tokens.js';
import { webapi, useFetch } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { useSiteSettings } from '../lib/site-settings.jsx';

export default function Paths() {
  const { t } = useI18n();
  const settings = useSiteSettings();
  const { data, loading } = useFetch(() => webapi.paths(), []);
  const paths = data?.paths || [];

  return (
    <div style={{ background: colors.surfaceMuted, minHeight: '70vh' }}>
      <PageHero title={t('paths.title')} subtitle={settings.home?.paths_subtitle || t('paths.subtitle')} />
      <Container style={{ padding: '32px 24px 60px' }}>
        {loading ? (
          <div style={{ color: colors.muted }}>{t('common.loading')}</div>
        ) : paths.length === 0 ? (
          <div style={{ color: colors.muted, fontSize: 15 }}>{t('paths.empty')}</div>
        ) : (
          <div className="grid-3">
            {paths.map((path, i) => <PathCard key={path.id} path={path} index={i} />)}
          </div>
        )}
      </Container>
    </div>
  );
}
