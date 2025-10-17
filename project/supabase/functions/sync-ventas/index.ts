import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

type Venta = {
  id: string
  fecha: string
  subtotal: number
  itbms: number
  total: number
  propina?: number
  num_items?: number
}

async function getToken(base: string, user: string, pass: string) {
  const r = await fetch(`${base}/userAuth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: user,
      password: pass,
      grant_type: "authentication"
    }),
  })
  if (!r.ok) throw new Error(await r.text())
  const { token } = await r.json()
  if (!token) throw new Error("Auth sin token")
  return token as string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    })
  }

  try {
    // === 1) Init supabase admin client ===
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // === 2) Parse query params ===
    const url = new URL(req.url)
    const desdeQ = url.searchParams.get('desde')
    const hastaQ = url.searchParams.get('hasta')
    const sucursalFiltro = url.searchParams.get('sucursal_id')

    // Use Panama timezone for date calculations
    const nowPanama = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Panama' }))

    // Parse dates in Panama timezone
    const startEpoch = desdeQ
      ? Math.floor(new Date(desdeQ + 'T00:00:00-05:00').getTime() / 1000)
      : Math.floor(new Date(nowPanama.toISOString().split('T')[0] + 'T00:00:00-05:00').getTime() / 1000)
    const endEpoch = hastaQ
      ? Math.floor(new Date(hastaQ + 'T23:59:59-05:00').getTime() / 1000)
      : Math.floor(new Date(nowPanama.toISOString().split('T')[0] + 'T23:59:59-05:00').getTime() / 1000)

    console.log('[sync-ventas] Date params:', {
      desdeQ,
      hastaQ,
      startEpoch,
      endEpoch,
      startDate: new Date(startEpoch * 1000).toISOString(),
      endDate: new Date(endEpoch * 1000).toISOString(),
      nowPanama: nowPanama.toISOString()
    })

    // === 3) Leer credenciales de sucursales ===
    const { data: creds, error: errCreds } = sucursalFiltro
      ? await supabaseClient.from("invu_credenciales").select("sucursal_id, usuario, password").eq("sucursal_id", sucursalFiltro)
      : await supabaseClient.from("invu_credenciales").select("sucursal_id, usuario, password")

    if (errCreds) throw new Error("Error cargando credenciales: " + errCreds.message)
    if (!creds || creds.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        success: true,
        date: new Date().toISOString().split('T')[0],
        branches: [],
        recibidas: 0,
        detalle: {},
        diag: { msg: "No creds" }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const base = Deno.env.get("INVU_BASE_URL") ?? "https://api6.invupos.com/invuApiPos"

    // === 3.5) Leer nombres de sucursales para el response ===
    const sucursalIds = creds.map(c => c.sucursal_id)
    const { data: sucursalesData, error: errSucursales } = await supabaseClient
      .from("sucursal")
      .select("id, nombre")
      .in("id", sucursalIds)

    if (errSucursales) {
      console.error("Error loading sucursal names:", errSucursales)
    }

    const sucursalMap = new Map<string, string>()
    if (sucursalesData) {
      sucursalesData.forEach(s => sucursalMap.set(s.id, s.nombre))
    }

    let totalRec = 0
    const detalle: Record<string, number> = {}
    const branches: Array<{ name: string; orders: number; sales: number }> = []
    const diag: Record<string, unknown> = {
      params: { fini: startEpoch, ffin: endEpoch, sucursales: creds.length, base }
    }

    // === 4) Iterar sucursales ===
    for (const c of creds) {
      const sucursalName = sucursalMap.get(c.sucursal_id) || c.sucursal_id
      try {
        console.log(`[sync-ventas] Processing sucursal: ${sucursalName}`)

        const token = await getToken(base, c.usuario, c.password)
        console.log(`[sync-ventas] Got token for ${sucursalName}`)

        const urlVentas = `${base}/index.php?r=citas/ordenesAllAdv/fini/${startEpoch}/ffin/${endEpoch}/tipo/all`
        console.log(`[sync-ventas] Fetching from INVU: ${urlVentas}`)

        const ventasRes = await fetch(urlVentas, {
          headers: {
            "authorization": token,
            "Content-Type": "application/json",
            "Accept": "application/json"
          }
        })

        console.log(`[sync-ventas] INVU response status for ${sucursalName}: ${ventasRes.status}`)

        if (!ventasRes.ok) {
          throw new Error(`INVU API returned ${ventasRes.status}: ${await ventasRes.text()}`)
        }

        const preview = await ventasRes.clone().text()
        let ventas: Venta[] = []
        try {
          const parsed = await ventasRes.json()
          ventas = Array.isArray(parsed) ? parsed : []
          console.log(`[sync-ventas] Parsed ${ventas.length} ventas for ${sucursalName}`)
        } catch (parseError) {
          console.error(`[sync-ventas] JSON parse error for ${sucursalName}:`, parseError)
          throw new Error("Respuesta no es JSON: " + preview.slice(0, 120))
        }

        if (ventas.length === 0) {
          console.warn(`[sync-ventas] No ventas found for ${sucursalName} in date range`)
          branches.push({
            name: sucursalName,
            orders: 0,
            sales: 0
          })
          diag[c.sucursal_id] = {
            step: "ventas_ok_but_empty",
            count: 0,
            totalSales: 0,
            message: "INVU returned empty array - no sales in this date range",
            urlVentas,
            responsePreview: preview.slice(0, 200)
          }
          continue
        }

        // Upsert to database
        const { error: upErr } = await supabaseClient.from("invu_ventas").upsert(
          ventas.map(v => ({
            id: v.id,
            fecha: v.fecha?.slice(0, 10),
            sucursal_id: c.sucursal_id,
            subtotal: v.subtotal,
            itbms: v.itbms,
            total: v.total,
            propina: v.propina ?? null,
            num_items: v.num_items ?? null,
            updated_at: new Date().toISOString()
          })),
          { onConflict: "id" }
        )
        if (upErr) {
          console.error(`[sync-ventas] Database upsert error for ${sucursalName}:`, upErr)
          throw new Error(upErr.message)
        }

        console.log(`[sync-ventas] Successfully upserted ${ventas.length} ventas for ${sucursalName}`)

        // Calculate total sales for this branch
        const totalSales = ventas.reduce((sum, v) => sum + (v.total || 0), 0)

        totalRec += ventas.length
        detalle[c.sucursal_id] = ventas.length

        // Add to branches array for response
        branches.push({
          name: sucursalName,
          orders: ventas.length,
          sales: totalSales
        })

        diag[c.sucursal_id] = {
          step: "ventas_ok",
          count: ventas.length,
          totalSales: totalSales,
          sample: ventas[0] ? JSON.stringify(ventas[0]).slice(0, 150) : "no data",
          urlVentas
        }
      } catch (e) {
        console.error(`[sync-ventas] Error processing ${sucursalName}:`, e)
        diag[c.sucursal_id] = {
          step: "ventas_error",
          error: String(e),
          errorStack: e instanceof Error ? e.stack : undefined,
          sucursalName
        }
        branches.push({
          name: sucursalName,
          orders: 0,
          sales: 0
        })
      }
    }

    // Format date as YYYY-MM-DD
    const dateStr = new Date().toISOString().split('T')[0]

    return new Response(
      JSON.stringify({
        ok: true,
        success: true,
        date: dateStr,
        branches,
        desde: startEpoch,
        hasta: endEpoch,
        recibidas: totalRec,
        detalle,
        diag
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    )
  } catch (error) {
    console.error("Error in sync-ventas function:", error)
    return new Response(
      JSON.stringify({ error: error.message, success: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    )
  }
})
