#!/usr/bin/env ruby

require 'bigdecimal'
require 'csv'
require 'date'
require 'fileutils'
require 'rexml/document'
require 'rexml/parsers/pullparser'

def read_zip_entry(path, entry)
  IO.popen(['unzip', '-p', path, entry], &:read)
end

def shared_strings(path)
  document = REXML::Document.new(read_zip_entry(path, 'xl/sharedStrings.xml'))
  document.root.elements.map do |item|
    text = +''
    item.each_recursive do |node|
      text << (node.text || '') if node.is_a?(REXML::Element) && node.name == 't'
    end
    text.gsub(/\s+/, ' ').strip
  end
end

def invoice_rows(path)
  strings = shared_strings(path)
  input = IO.popen(['unzip', '-p', path, 'xl/worksheets/sheet1.xml'])
  parser = REXML::Parsers::PullParser.new(input)
  invoices = {}
  row = {}
  cell_column = nil
  cell_type = nil
  reading_value = false
  value = +''

  while parser.has_next?
    event = parser.pull
    if event.start_element?
      name = event[0]
      attributes = event[1]
      if name == 'row'
        row = {}
      elsif name == 'c'
        cell_column = attributes['r'].sub(/\d+/, '')
        cell_type = attributes['t']
        value = +''
      elsif name == 'v'
        reading_value = true
        value = +''
      end
    elsif event.text? && reading_value
      value << event[0]
    elsif event.end_element?
      name = event[0]
      if name == 'v'
        reading_value = false
      elsif name == 'c'
        row[cell_column] = cell_type == 's' ? strings[value.to_i] : value unless value.empty?
      elsif name == 'row' && row['A']&.match?(/\AMA\d/)
        invoices[row['A']] = row
      end
    end
  end
  input.close
  invoices
end

def approved_listing_rows(path)
  strings = shared_strings(path)
  input = IO.popen(['unzip', '-p', path, 'xl/worksheets/sheet1.xml'])
  parser = REXML::Parsers::PullParser.new(input)
  rows = {}
  row = {}
  cell_column = nil
  cell_type = nil
  reading_value = false
  value = +''

  while parser.has_next?
    event = parser.pull
    if event.start_element?
      name = event[0]
      attributes = event[1]
      if name == 'row'
        row = {}
      elsif name == 'c'
        cell_column = attributes['r'].sub(/\d+/, '')
        cell_type = attributes['t']
        value = +''
      elsif name == 'v'
        reading_value = true
        value = +''
      end
    elsif event.text? && reading_value
      value << event[0]
    elsif event.end_element?
      name = event[0]
      if name == 'v'
        reading_value = false
      elsif name == 'c'
        row[cell_column] = cell_type == 's' ? strings[value.to_i] : value unless value.empty?
      elsif name == 'row' && row['A']&.match?(/\AMA\d/)
        rows[row['A']] = {
          'invoice_no' => text(row['A']),
          'invoice_date' => excel_date(row['I']),
          'debtor_code' => text(row['M']),
          'debtor_name' => text(row['Q']),
          'currency' => text(row['X']),
          'total' => money(row['Z']),
          'local_total' => money(row['AJ'])
        }
      end
    end
  end
  input.close
  rows
end

def text(value)
  value.to_s.gsub(/\s+/, ' ').strip
end

def money(value)
  format('%.2f', BigDecimal(value.to_s.empty? ? '0' : value.to_s))
end

def excel_date(value)
  return '' if value.to_s.empty?
  (Date.new(1899, 12, 30) + value.to_i).iso8601
rescue Date::Error
  ''
end

def invoice_status(code)
  { 'A' => 'approved', 'V' => 'void', 'E' => 'expired' }.fetch(text(code), 'unknown')
end

def normalized_vehicle_number(value)
  text(value).upcase.gsub(/[^A-Z0-9]/, '')
end

def parse_vehicle(value)
  raw = text(value).upcase
  return { raw: '', status: 'missing', parts: [] } if raw.empty?
  return { raw: raw, status: 'non_vehicle_text', parts: [] } unless raw.match?(/[A-Z]/) && raw.match?(/\d/)

  parts = raw.split(/(?:\s+\/\s*|\s*\/\s+)/).map { |part| text(part) }.reject(&:empty?)
  invalid = parts.any? do |part|
    normalized = normalized_vehicle_number(part)
    normalized.length < 3 || normalized.length > 18 || !normalized.match?(/[A-Z]/) || !normalized.match?(/\d/)
  end
  status = if invalid
             'needs_review'
           elsif parts.length == 1
             'single'
           elsif parts.length == 2
             'combined'
           else
             'multiple_needs_review'
           end
  { raw: raw, status: status, parts: parts }
end

def write_csv(path, headers, rows)
  CSV.open(path, 'w', write_headers: true, headers: headers, force_quotes: true) do |csv|
    rows.each { |row| csv << headers.map { |header| row[header] } }
  end
end

source_path, comparison_path, output_dir, approved_listing_path = ARGV
abort 'Usage: process_autocount_invoice_export.rb SOURCE.xlsx COMPARISON.xlsx OUTPUT_DIR' unless output_dir

source = invoice_rows(source_path)
comparison = invoice_rows(comparison_path)
abort 'The two source exports do not contain the same invoice records.' unless source == comparison

FileUtils.mkdir_p(output_dir)

invoice_records = []
company_aggregates = {}
job_aggregates = {}
vehicle_aggregates = {}
vehicle_review = Hash.new { |hash, key| hash[key] = { 'vehicle_no_raw' => key, 'invoice_count' => 0, 'reason' => '' } }

source.values.each do |row|
  invoice_no = text(row['A'])
  date = excel_date(row['B'])
  debtor_code = text(row['C'])
  debtor_name = text(row['D'])
  vehicle = parse_vehicle(row['G'])
  job_no = text(row['I'])
  total = money(row['J'])
  local_total = money(row['K'])
  outstanding = money(row['L'])
  status = invoice_status(row['O'])

  invoice_records << {
    'invoice_no' => invoice_no,
    'invoice_date' => date,
    'debtor_code' => debtor_code,
    'debtor_name' => debtor_name,
    'agent' => text(row['E']),
    'currency' => text(row['F']),
    'vehicle_no_raw' => vehicle[:raw],
    'primary_vehicle_no' => vehicle[:parts][0].to_s,
    'related_vehicle_no' => vehicle[:parts][1..]&.join(' | ').to_s,
    'vehicle_parse_status' => vehicle[:status],
    'job_no' => job_no,
    'exchange_rate' => text(row['H']),
    'total' => total,
    'local_total' => local_total,
    'outstanding' => outstanding,
    'cancelled' => text(row['M']) == 'T' ? 'true' : 'false',
    'multi_pricing' => text(row['N']),
    'invoice_status' => status,
    'e_invoice_status' => text(row['P']),
    'e_invoice_uuid' => text(row['Q'])
  }

  company = (company_aggregates[debtor_code] ||= {
    'debtor_code' => debtor_code, 'debtor_name' => debtor_name, 'invoice_count' => 0,
    'approved_invoice_count' => 0, 'first_invoice_date' => date, 'last_invoice_date' => date,
    'total' => BigDecimal('0'), 'outstanding' => BigDecimal('0')
  })
  company['invoice_count'] += 1
  company['approved_invoice_count'] += 1 if status == 'approved'
  company['first_invoice_date'] = [company['first_invoice_date'], date].reject(&:empty?).min.to_s
  company['last_invoice_date'] = [company['last_invoice_date'], date].max.to_s
  company['total'] += BigDecimal(local_total)
  company['outstanding'] += BigDecimal(outstanding)

  unless job_no.empty?
    job_key = [debtor_code, job_no]
    job = (job_aggregates[job_key] ||= {
      'debtor_code' => debtor_code, 'debtor_name' => debtor_name, 'job_no' => job_no,
      'invoice_count' => 0, 'invoice_numbers' => [], 'vehicle_numbers' => [],
      'first_invoice_date' => date, 'last_invoice_date' => date, 'local_total' => BigDecimal('0'),
      'needs_review' => 'false'
    })
    job['invoice_count'] += 1
    job['invoice_numbers'] << invoice_no
    job['vehicle_numbers'] << vehicle[:raw] unless vehicle[:raw].empty?
    job['first_invoice_date'] = [job['first_invoice_date'], date].reject(&:empty?).min.to_s
    job['last_invoice_date'] = [job['last_invoice_date'], date].max.to_s
    job['local_total'] += BigDecimal(local_total)
  end

  if vehicle[:parts].empty?
    unless vehicle[:raw].empty?
      review = vehicle_review[vehicle[:raw]]
      review['invoice_count'] += 1
      review['reason'] = vehicle[:status]
    end
  else
    vehicle[:parts].each_with_index do |part, index|
      normalized = normalized_vehicle_number(part)
      key = [debtor_code, normalized]
      aggregate = (vehicle_aggregates[key] ||= {
        'debtor_code' => debtor_code, 'debtor_name' => debtor_name,
        'vehicle_no' => part, 'normalized_vehicle_no' => normalized,
        'invoice_count' => 0, 'first_invoice_date' => date, 'last_invoice_date' => date,
        'seen_as_primary' => 0, 'seen_as_related' => 0, 'company_conflict' => 'false',
        'needs_review' => vehicle[:status].include?('review') ? 'true' : 'false',
        'sample_source_value' => vehicle[:raw]
      })
      aggregate['invoice_count'] += 1
      aggregate[index.zero? ? 'seen_as_primary' : 'seen_as_related'] += 1
      aggregate['first_invoice_date'] = [aggregate['first_invoice_date'], date].reject(&:empty?).min.to_s
      aggregate['last_invoice_date'] = [aggregate['last_invoice_date'], date].max.to_s
    end
  end
end

vehicle_aggregates.values.group_by { |vehicle| vehicle['normalized_vehicle_no'] }.each_value do |vehicles|
  next unless vehicles.map { |vehicle| vehicle['debtor_code'] }.uniq.length > 1
  vehicles.each do |vehicle|
    vehicle['company_conflict'] = 'true'
    vehicle['needs_review'] = 'true'
  end
end

job_aggregates.each_value do |job|
  job['invoice_numbers'] = job['invoice_numbers'].uniq.sort.join(' | ')
  job['vehicle_numbers'] = job['vehicle_numbers'].uniq.sort.join(' | ')
  job['needs_review'] = job['invoice_count'] > 1 ? 'true' : 'false'
  job['local_total'] = money(job['local_total'])
end

company_aggregates.each_value do |company|
  company['total'] = money(company['total'])
  company['outstanding'] = money(company['outstanding'])
end

invoice_headers = invoice_records.first.keys
company_headers = company_aggregates.values.first.keys
job_headers = job_aggregates.values.first.keys
vehicle_headers = vehicle_aggregates.values.first.keys
review_headers = vehicle_review.values.first&.keys || %w[vehicle_no_raw invoice_count reason]

write_csv(File.join(output_dir, 'invoices_clean.csv'), invoice_headers, invoice_records.sort_by { |row| [row['invoice_date'], row['invoice_no']] })
write_csv(File.join(output_dir, 'companies_summary.csv'), company_headers, company_aggregates.values.sort_by { |row| row['debtor_code'] })
write_csv(File.join(output_dir, 'jobs_summary.csv'), job_headers, job_aggregates.values.sort_by { |row| [row['debtor_code'], row['job_no']] })
write_csv(File.join(output_dir, 'vehicles_clean.csv'), vehicle_headers, vehicle_aggregates.values.sort_by { |row| [row['debtor_code'], row['normalized_vehicle_no']] })
write_csv(File.join(output_dir, 'vehicle_values_review.csv'), review_headers, vehicle_review.values.sort_by { |row| [-row['invoice_count'], row['vehicle_no_raw']] })

source_mismatches = []
approved_listing = approved_listing_path ? approved_listing_rows(approved_listing_path) : {}
unless approved_listing.empty?
  approved_grid = source.select { |_invoice_no, row| invoice_status(row['O']) == 'approved' }
  (approved_listing.keys - approved_grid.keys).sort.each do |invoice_no|
    source_mismatches << approved_listing[invoice_no].merge(
      'issue' => 'present_in_approved_listing_but_missing_from_main_grid_export'
    )
  end
  (approved_grid.keys - approved_listing.keys).sort.each do |invoice_no|
    row = approved_grid[invoice_no]
    source_mismatches << {
      'invoice_no' => invoice_no,
      'invoice_date' => excel_date(row['B']),
      'debtor_code' => text(row['C']),
      'debtor_name' => text(row['D']),
      'currency' => text(row['F']),
      'total' => money(row['J']),
      'local_total' => money(row['K']),
      'issue' => 'present_in_main_grid_export_but_missing_from_approved_listing'
    }
  end
  mismatch_headers = %w[invoice_no invoice_date debtor_code debtor_name currency total local_total issue]
  write_csv(File.join(output_dir, 'source_mismatch_review.csv'), mismatch_headers, source_mismatches)
end

status_counts = invoice_records.group_by { |row| row['invoice_status'] }.transform_values(&:length)
vehicle_status_counts = invoice_records.group_by { |row| row['vehicle_parse_status'] }.transform_values(&:length)
approved_total = invoice_records.select { |row| row['invoice_status'] == 'approved' }.sum { |row| BigDecimal(row['local_total']) }
all_total = invoice_records.sum { |row| BigDecimal(row['local_total']) }
job_duplicates = job_aggregates.values.count { |job| job['invoice_count'] > 1 }
company_conflicts = vehicle_aggregates.values.count { |vehicle| vehicle['company_conflict'] == 'true' }

summary = <<~MARKDOWN
  # AutoCount Invoice Export Processing Summary

  Source files were compared record-for-record before processing. They contain the same #{source.length} invoices and differ only in sort order.

  ## Output counts

  - Invoices: #{invoice_records.length}
  - Companies: #{company_aggregates.length}
  - Company/job combinations: #{job_aggregates.length}
  - Clean company/vehicle combinations: #{vehicle_aggregates.length}
  - Non-vehicle source values requiring review: #{vehicle_review.length}

  ## Invoice checks

  - Status counts: #{status_counts.map { |key, value| "#{key}=#{value}" }.join(', ')}
  - Approved local total: RM #{money(approved_total)}
  - All-status local total: RM #{money(all_total)}
  - Invoice numbers are unique: #{invoice_records.map { |row| row['invoice_no'] }.uniq.length == invoice_records.length}

  ## Review queues

  - Invoice vehicle parsing: #{vehicle_status_counts.map { |key, value| "#{key}=#{value}" }.join(', ')}
  - Reused company/job references: #{job_duplicates}
  - Vehicle/company conflicts: #{company_conflicts}
  - Cross-export invoice mismatches: #{source_mismatches.length}

  ## Import guidance

  - Use `invoice_no` as the unique external invoice key.
  - Use `debtor_code` as the stable AutoCount company reference.
  - Do not treat `job_no` as unique; review rows marked in `jobs_summary.csv`.
  - Import only vehicles where `needs_review=false`; manually resolve the remaining vehicle rows.
  - This export contains invoice headers but not labour/parts detail lines.
  - Resolve `source_mismatch_review.csv` against a refreshed AutoCount grid before database import.
MARKDOWN
File.write(File.join(output_dir, 'README.md'), summary)

puts summary
