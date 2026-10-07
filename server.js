import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 3000);
const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));

const hasSupabaseConfig = Boolean(supabaseUrl && anonKey && secretKey);

const adminClient = hasSupabaseConfig
  ? createClient(supabaseUrl, secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    })
  : null;

const authClient = hasSupabaseConfig
  ? createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    })
  : null;

app.get('/api/health', async (_req, res) => {
  if (!hasSupabaseConfig) {
    return res.status(503).json({
      ok: false,
      configured: false,
      database: false,
      error: 'Supabase environment variables are missing.'
    });
  }

  const { error } = await adminClient
    .from('profiles')
    .select('id')
    .limit(1);

  if (error) {
    console.error('SUPABASE DATABASE ERROR:', error);

    return res.status(503).json({
      ok: false,
      configured: true,
      database: false,
      error: error.message
    });
  }

  res.json({
    ok: true,
    configured: true,
    database: true
  });
});

app.get('/api/config', (_req, res) => {
  if (!hasSupabaseConfig) {
    return res.status(503).json({
      error: 'Supabase is not configured yet.'
    });
  }

  res.set('Cache-Control', 'no-store');

  res.json({
    url: supabaseUrl,
    anonKey
  });
});

async function requireUser(req, res, next) {
  if (!hasSupabaseConfig) {
    return res.status(503).json({
      error: 'Supabase is not configured yet.'
    });
  }

  const token = req
    .get('authorization')
    ?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    return res.status(401).json({
      error: 'Sign in required.'
    });
  }

  const { data, error } =
    await authClient.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({
      error: 'Session is invalid or expired.'
    });
  }

  const {
    data: profile,
    error: profileError
  } = await adminClient
    .from('profiles')
    .select('suspended_at')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError) {
    return res.status(500).json({
      error: 'Could not verify account status.'
    });
  }

  if (!profile || profile.suspended_at) {
    return res.status(403).json({
      error: 'This account is suspended.'
    });
  }

  req.user = data.user;
  req.accessToken = token;
  next();
}

async function requireAdmin(req, res, next) {
  const { data, error } = await adminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', req.user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (error) {
    return res.status(500).json({
      error: 'Could not verify administrator access.'
    });
  }

  if (!data) {
    return res.status(403).json({
      error: 'Administrator access required.'
    });
  }

  next();
}

app.get(
  '/api/admin/users',
  requireUser,
  requireAdmin,
  async (req, res) => {
    const page = Math.max(
      1,
      Number(req.query.page) || 1
    );

    const perPage = Math.min(
      1000,
      Math.max(
        1,
        Number(req.query.perPage) || 200
      )
    );

    const {
      data: authData,
      error: authError
    } = await adminClient.auth.admin.listUsers({
      page,
      perPage
    });

    if (authError) {
      return res.status(500).json({
        error: 'Could not load accounts.'
      });
    }

    const userIds =
      (authData.users || []).map(
        user => user.id
      );

    const [
      { data: profiles, error: profileError },
      { data: roles, error: rolesError }
    ] = userIds.length
      ? await Promise.all([
          adminClient
            .from('profiles')
            .select(
              'id, full_name, phone, created_at, suspended_at'
            )
            .in('id', userIds),

          adminClient
            .from('user_roles')
            .select('user_id, role')
            .in('user_id', userIds)
        ])
      : [
          { data: [], error: null },
          { data: [], error: null }
        ];

    if (
      authError ||
      profileError ||
      rolesError
    ) {
      return res.status(500).json({
        error: 'Could not load accounts.'
      });
    }

    const profileById = new Map(
      (profiles || []).map(profile => [
        profile.id,
        profile
      ])
    );

    const roleById = new Map(
      (roles || []).map(role => [
        role.user_id,
        role.role
      ])
    );

    res.json(
      (authData.users || []).map(user => {
        const profile =
          profileById.get(user.id) || {};

        return {
          id: user.id,
          email: user.email,
          name:
            profile.full_name ||
            user.user_metadata?.full_name ||
            '',
          createdAt: user.created_at,
          emailConfirmed:
            Boolean(user.email_confirmed_at),
          suspended: Boolean(
            profile.suspended_at ||
            user.banned_until
          ),
          role:
            roleById.get(user.id) ||
            'user'
        };
      })
    );
  }
);

app.patch(
  '/api/admin/users/:id/suspension',
  requireUser,
  requireAdmin,
  async (req, res) => {
    const { suspended } =
      req.body || {};

    if (typeof suspended !== 'boolean') {
      return res.status(400).json({
        error:
          'suspended must be true or false.'
      });
    }

    if (req.params.id === req.user.id) {
      return res.status(400).json({
        error:
          'You cannot suspend your own account.'
      });
    }

    const {
      data: role,
      error: roleError
    } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', req.params.id)
      .maybeSingle();

    if (roleError) {
      return res.status(500).json({
        error:
          'Could not verify target account.'
      });
    }

    if (role?.role === 'admin') {
      return res.status(403).json({
        error:
          'Administrator accounts cannot be suspended here.'
      });
    }

    const { error: profileError } =
      await adminClient
        .from('profiles')
        .update({
          suspended_at: suspended
            ? new Date().toISOString()
            : null
        })
        .eq('id', req.params.id);

    if (profileError) {
      return res.status(500).json({
        error:
          'Could not update account status.'
      });
    }

    const { error: authError } =
      await adminClient.auth.admin.updateUserById(
        req.params.id,
        {
          ban_duration: suspended
            ? '876000h'
            : 'none'
        }
      );

    if (authError) {
      return res.status(500).json({
        error:
          'Account status was saved, but Auth could not be updated.'
      });
    }

    res.json({
      ok: true,
      suspended
    });
  }
);

app.delete(
  '/api/admin/users/:id',
  requireUser,
  requireAdmin,
  async (req, res) => {
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        error:
          'You cannot delete your own account.'
      });
    }

    if (
      req.get('x-confirm-delete') !==
      'DELETE'
    ) {
      return res.status(400).json({
        error:
          'Explicit delete confirmation is required.'
      });
    }

    const {
      data: role,
      error: roleError
    } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', req.params.id)
      .maybeSingle();

    if (roleError) {
      return res.status(500).json({
        error:
          'Could not verify target account.'
      });
    }

    if (role?.role === 'admin') {
      return res.status(403).json({
        error:
          'Administrator accounts cannot be deleted here.'
      });
    }

    const {
      data: listings,
      error: listingError
    } = await adminClient
      .from('properties')
      .select('id')
      .eq('owner_id', req.params.id);

    if (listingError) {
      return res.status(500).json({
        error:
          'Could not prepare this account’s listings for deletion.'
      });
    }

    const listingIds =
      (listings || []).map(
        item => item.id
      );

    const {
      data: documents,
      error: documentError
    } = listingIds.length
      ? await adminClient
          .from('property_verifications')
          .select(
            'id, document_path'
          )
          .in(
            'property_id',
            listingIds
          )
      : {
          data: [],
          error: null
        };

    if (documentError) {
      return res.status(500).json({
        error:
          'Could not prepare this account’s documents for deletion.'
      });
    }

    const { error: archiveError } =
      await adminClient
        .from('properties')
        .update({
          status: 'Archived'
        })
        .eq(
          'owner_id',
          req.params.id
        );

    if (archiveError) {
      return res.status(500).json({
        error:
          'Could not archive this account’s listings.'
      });
    }

    if (listingIds.length) {
      const {
        error: reviewError
      } = await adminClient
        .from('property_verifications')
        .update({
          status: 'Replaced'
        })
        .in(
          'property_id',
          listingIds
        )
        .eq(
          'status',
          'Pending'
        );

      if (reviewError) {
        return res.status(500).json({
          error:
            'Could not close pending document reviews.'
        });
      }
    }

    const { error } =
      await adminClient.auth.admin.deleteUser(
        req.params.id
      );

    if (error) {
      return res.status(500).json({
        error:
          'Could not delete account.'
      });
    }

    const paths =
      (documents || []).map(
        item => item.document_path
      );

    if (paths.length) {
      const {
        error: storageError
      } = await adminClient.storage
        .from(
          'verification-documents'
        )
        .remove(paths);

      if (storageError) {
        console.error(
          'Could not remove deleted account verification files:',
          storageError.message
        );
      }
    }

    res.json({
      ok: true
    });
  }
);

app.get(
  '/api/admin/properties',
  requireUser,
  requireAdmin,
  async (_req, res) => {
    const {
      data,
      error
    } = await adminClient
      .from('properties')
      .select(
        'id, title, type, price, location, status, publication_status, verification_status, verification_note, owner_id, owner_email, owner_name, created_at'
      )
      .order(
        'created_at',
        {
          ascending: false
        }
      );

    if (error) {
      return res.status(500).json({
        error:
          'Could not load property listings.'
      });
    }

    const ownerIds = [
      ...new Set(
        (data || [])
          .map(
            item => item.owner_id
          )
          .filter(Boolean)
      )
    ];

    const {
      data: profiles,
      error: profileError
    } = ownerIds.length
      ? await adminClient
          .from('profiles')
          .select(
            'id, full_name'
          )
          .in(
            'id',
            ownerIds
          )
      : {
          data: [],
          error: null
        };

    if (profileError) {
      return res.status(500).json({
        error:
          'Could not load listing owners.'
      });
    }

    const names = new Map(
      (profiles || []).map(
        profile => [
          profile.id,
          profile.full_name
        ]
      )
    );

    res.json(
      (data || []).map(item => ({
        ...item,
        owner_name:
          names.get(
            item.owner_id
          ) ||
          item.owner_name
      }))
    );
  }
);

app.get(
  '/api/admin/verifications',
  requireUser,
  requireAdmin,
  async (_req, res) => {
    const {
      data: reviews,
      error
    } = await adminClient
      .from(
        'property_verifications'
      )
      .select(
        'id, property_id, submitted_by, document_type, status, created_at'
      )
      .eq(
        'status',
        'Pending'
      )
      .order(
        'created_at',
        {
          ascending: true
        }
      );

    if (error) {
      return res.status(500).json({
        error:
          'Could not load verification requests.'
      });
    }

    const propertyIds = [
      ...new Set(
        (reviews || []).map(
          item =>
            item.property_id
        )
      )
    ];

    const ownerIds = [
      ...new Set(
        (reviews || [])
          .map(
            item =>
              item.submitted_by
          )
          .filter(Boolean)
      )
    ];

    const [
      {
        data: listings,
        error: listingError
      },
      {
        data: profiles,
        error: profileError
      }
    ] = propertyIds.length
      ? await Promise.all([
          adminClient
            .from('properties')
            .select(
              'id, title, location, price, owner_id, owner_email, owner_name, status, publication_status'
            )
            .in(
              'id',
              propertyIds
            ),

          ownerIds.length
            ? adminClient
                .from('profiles')
                .select(
                  'id, full_name'
                )
                .in(
                  'id',
                  ownerIds
                )
            : Promise.resolve({
                data: [],
                error: null
              })
        ])
      : [
          {
            data: [],
            error: null
          },
          {
            data: [],
            error: null
          }
        ];

    if (
      listingError ||
      profileError
    ) {
      return res.status(500).json({
        error:
          'Could not load verification listing details.'
      });
    }

    const listingById =
      new Map(
        (listings || []).map(
          item => [
            item.id,
            item
          ]
        )
      );

    const profileById =
      new Map(
        (profiles || []).map(
          item => [
            item.id,
            item
          ]
        )
      );

    res.json(
      (reviews || [])
        .filter(
          review =>
            listingById.has(
              review.property_id
            )
        )
        .map(review => {
          const listing =
            listingById.get(
              review.property_id
            );

          return {
            id: review.id,
            propertyId:
              review.property_id,
            documentType:
              review.document_type,
            submittedAt:
              review.created_at,
            title:
              listing.title,
            location:
              listing.location,
            price:
              listing.price,
            ownerName:
              profileById.get(
                listing.owner_id
              )?.full_name ||
              listing.owner_name,
            ownerEmail:
              listing.owner_email,
            publicationStatus:
              listing.publication_status
          };
        })
    );
  }
);

app.get(
  '/api/admin/verifications/:id/document',
  requireUser,
  requireAdmin,
  async (req, res) => {
    const {
      data: verification,
      error
    } = await adminClient
      .from(
        'property_verifications'
      )
      .select(
        'document_path'
      )
      .eq(
        'id',
        req.params.id
      )
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        error:
          'Could not load verification document.'
      });
    }

    if (!verification) {
      return res.status(404).json({
        error:
          'Verification request not found.'
      });
    }

    const {
      data,
      error: urlError
    } = await adminClient.storage
      .from(
        'verification-documents'
      )
      .createSignedUrl(
        verification.document_path,
        300
      );

    if (
      urlError ||
      !data?.signedUrl
    ) {
      return res.status(500).json({
        error:
          'Could not open verification document.'
      });
    }

    res.set(
      'Cache-Control',
      'no-store'
    );

    res.json({
      url: data.signedUrl
    });
  }
);

app.patch(
  '/api/admin/verifications/:id/review',
  requireUser,
  requireAdmin,
  async (req, res) => {
    const {
      approve,
      note = ''
    } = req.body || {};

    if (
      typeof approve !==
      'boolean'
    ) {
      return res.status(400).json({
        error:
          'approve must be true or false.'
      });
    }

    if (
      typeof note !==
        'string' ||
      note.trim().length >
        1000
    ) {
      return res.status(400).json({
        error:
          'Review note must be at most 1000 characters.'
      });
    }

    if (
      !approve &&
      !note.trim()
    ) {
      return res.status(400).json({
        error:
          'A reason is required when rejecting a listing.'
      });
    }

    const { error } =
      await adminClient.rpc(
        'review_property_verification',
        {
          target_verification_id:
            req.params.id,
          approve_listing:
            approve,
          review_note_input:
            note.trim(),
          reviewer_id:
            req.user.id
        }
      );

    if (error) {
      const notPending =
        /no longer pending|not found|no longer available|does not match/i.test(
          error.message || ''
        );

      return res.status(
        notPending
          ? 409
          : 500
      ).json({
        error:
          notPending
            ? 'This request is no longer awaiting review.'
            : 'Could not save the review decision.'
      });
    }

    res.json({
      ok: true,
      approved: approve
    });
  }
);

app.patch(
  '/api/admin/properties/:id/status',
  requireUser,
  requireAdmin,
  async (req, res) => {
    const { status } =
      req.body || {};

    if (
      ![
        'Available',
        'Unavailable',
        'Archived'
      ].includes(status)
    ) {
      return res.status(400).json({
        error:
          'Invalid listing status.'
      });
    }

    const {
      data,
      error
    } = await adminClient
      .from('properties')
      .update({
        status,
        updated_at:
          new Date().toISOString()
      })
      .eq(
        'id',
        req.params.id
      )
      .select(
        'id, status'
      )
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        error:
          'Could not update listing status.'
      });
    }

    if (!data) {
      return res.status(404).json({
        error:
          'Listing not found.'
      });
    }

    res.json(data);
  }
);

app.delete(
  '/api/admin/properties/:id',
  requireUser,
  requireAdmin,
  async (req, res) => {
    if (
      req.get(
        'x-confirm-delete'
      ) !== 'DELETE'
    ) {
      return res.status(400).json({
        error:
          'Explicit delete confirmation is required.'
      });
    }

    const {
      data: documents,
      error: documentError
    } = await adminClient
      .from(
        'property_verifications'
      )
      .select(
        'document_path'
      )
      .eq(
        'property_id',
        req.params.id
      );

    if (documentError) {
      return res.status(500).json({
        error:
          'Could not prepare listing documents for deletion.'
      });
    }

    const {
      data,
      error
    } = await adminClient
      .from('properties')
      .delete()
      .eq(
        'id',
        req.params.id
      )
      .select('id')
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        error:
          'Could not permanently delete listing.'
      });
    }

    if (!data) {
      return res.status(404).json({
        error:
          'Listing not found.'
      });
    }

    const paths =
      (documents || []).map(
        item =>
          item.document_path
      );

    if (paths.length) {
      const {
        error: storageError
      } = await adminClient.storage
        .from(
          'verification-documents'
        )
        .remove(paths);

      if (storageError) {
        console.error(
          'Could not remove deleted listing verification files:',
          storageError.message
        );
      }
    }

    res.json({
      ok: true
    });
  }
);

app.use(
  '/api',
  (_req, res) =>
    res.status(404).json({
      error:
        'API route not found.'
    })
);

/* แก้ตรงนี้แล้ว: L1D1.html → index.html */
app.get(
  '/',
  (_req, res) =>
    res.sendFile(
      path.join(
        __dirname,
        'index.html'
      )
    )
);

app.get(
  '*path',
  (_req, res) =>
    res.sendFile(
      path.join(
        __dirname,
        'index.html'
      )
    )
);

app.listen(
  port,
  '0.0.0.0',
  () =>
    console.log(
      `RENTORA listening on ${port}`
    )
);
